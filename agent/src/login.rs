// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

//! Signing into Shopee VN from the Login button.
//!
//! The order is the safety: open the account page first. A profile that is
//! already signed in is left exactly as it is — the saved cookie is not
//! written, because an older seed can replace a live session. Only a signed-out
//! profile gets the stored cookie; only when the cookie is still not enough do
//! the saved username and password go into the form.
//!
//! Keys are real `Input.dispatchKeyEvent`s with uneven delays. `Input.insertText`
//! would put the password in as one event, and a page can tell. `Runtime.enable`
//! is never called and scripts run in the isolated world (see browse.rs), the
//! same discipline as `page.*`.
//!
//! A saved credential is written by the browser when a field takes focus, which
//! is after the form was scanned. The field is clicked first, whatever it holds
//! at that moment is cleared, and only then does the typing start.
//!
//! If Shopee asks for a verification code or a captcha, this stops. The browser
//! stays open for a person. Typing one-time codes by machine is a timing
//! signature, and it is the one step this deliberately does not automate.

use std::time::{Duration, Instant};

use serde_json::Value;

use crate::browse::Page;

/// How long the shop gets to answer after the form is submitted.
const CHECK_TIMEOUT: Duration = Duration::from_secs(20);

/// What one Login press did. `signed_in_now` is the difference between "the
/// saved cookie was already good" and "the form was filled and accepted", which
/// the window says in different words.
pub struct Outcome {
    pub logged_in: bool,
    pub cookie_written: bool,
    pub signed_in_now: bool,
    pub needs_action: bool,
    pub url: String,
    pub reason: Option<String>,
}

struct PageState {
    url: String,
    on_login_page: bool,
    otp: bool,
    captcha: bool,
}

struct Form {
    user: Option<(f64, f64)>,
    password: Option<(f64, f64)>,
    /// A control that switches a QR-first page to the password form.
    password_tab: Option<(f64, f64)>,
    submit: Option<(f64, f64)>,
}

/// What the current page is, from the shop's point of view.
///
/// `on_login_page` is path or a visible password field. The account page the
/// check navigates to redirects to `/buyer/login` when signed out; when signed
/// in it stays. The verification flags are read first: a page that asks for a
/// code or a captcha is a stop, not a form to fill.
const STATE_SCRIPT: &str = r#"(() => {
  const visible = e => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const path = location.pathname || '';
  const body = ((document.body && document.body.innerText) || '').slice(0, 8000);
  const hasPassword = Array.from(document.querySelectorAll('input[type="password"]')).some(visible);
  const otp = Array.from(document.querySelectorAll(
    'input[autocomplete="one-time-code"], input[name*="otp" i], input[name*="verify" i], input[placeholder*="mã xác minh" i]'
  )).some(visible)
    || /nhập mã xác minh|mã xác minh|verification code|enter the code/i.test(body);
  const captcha = Array.from(document.querySelectorAll(
    'iframe[src*="captcha"], [class*="captcha"], [id*="captcha"]'
  )).some(visible)
    || /captcha|verify you are human|xác minh bạn là người/i.test(body);
  return {
    url: location.href,
    on_login_page: /\/buyer\/login|\/login/i.test(path) || hasPassword,
    otp,
    captcha,
  };
})()"#;

/// Where the two fields and the button are, in viewport coordinates.
///
/// The password field anchors the form. The username is the first usable input
/// in the same form, falling back to the page, because several Shopee
/// storefronts put their search box before the form. The submit button is found
/// by type or by its wording; `press_enter` covers a form that has neither.
const FORM_SCRIPT: &str = r#"(() => {
  const visible = e => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const password = Array.from(document.querySelectorAll('input[type="password"]')).find(visible);
  // The password's own form when it has one; the page otherwise. Falling back
  // to the first form on the page would pick a search box on a site that puts
  // its login fields in a div.
  const scope = (password && password.closest('form')) || document;
  const usable = e => {
    const type = (e.type || 'text').toLowerCase();
    return e !== password && !e.disabled && !e.readOnly
      && !['hidden', 'checkbox', 'radio', 'submit', 'button', 'password'].includes(type);
  };
  const user = Array.from(scope.querySelectorAll('input')).filter(visible).find(usable)
    || Array.from(document.querySelectorAll('input')).filter(visible).find(usable);
  const isSubmit = b => (b.getAttribute('type') || '').toLowerCase() === 'submit'
    || /đăng nhập|dang nhap|login|sign in/i.test((b.innerText || b.value || '').trim());
  const submit = Array.from(scope.querySelectorAll('button, [role="button"], input[type="submit"]')).filter(visible).find(isSubmit)
    || Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).filter(visible).find(isSubmit);
  const tab = Array.from(document.querySelectorAll('button, a, [role="tab"], [role="button"]')).filter(visible)
    .find(e => {
      const text = (e.innerText || '').trim();
      return text.length > 0 && text.length < 48 && /mật khẩu|password/i.test(text) && !/quên|forgot/i.test(text);
    });
  const rect = e => {
    if (!e) return null;
    e.scrollIntoView({ block: 'center', inline: 'center' });
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  return {
    user: rect(user),
    password: rect(password),
    password_tab: password ? null : rect(tab),
    submit: rect(submit),
  };
})()"#;

/// What has focus right now, and whether it holds anything.
///
/// Read after the click that focuses a field: Chromium writes a saved
/// credential when the field is focused, which is after `FORM_SCRIPT`
/// took its snapshot. `input` is part of the answer so a clear is never
/// sent when focus is somewhere else and Ctrl+A would select the page.
const FOCUS_SCRIPT: &str = r#"(() => {
  const e = document.activeElement;
  const input = !!e && e.tagName === 'INPUT'
    && !['hidden', 'checkbox', 'radio', 'submit', 'button'].includes(String(e.type || 'text').toLowerCase());
  return { input, filled: input && !!(e.value || '').length };
})()"#;

pub async fn shopee(
    ws: &str,
    login_url: &str,
    check_url: &str,
    cookies: &[Value],
    username: Option<&str>,
    password: Option<&str>,
) -> anyhow::Result<Outcome> {
    let mut page = Page::attach(ws).await?;

    // 1. Is this profile already signed in? If it is, nothing is written:
    //    an older cookie must not replace a session the shop has refreshed.
    page.navigate(check_url).await?;
    let mut state = page_state(&mut page).await?;
    if state.otp || state.captcha {
        return finish(
            page,
            Outcome {
                logged_in: false,
                cookie_written: false,
                signed_in_now: false,
                needs_action: true,
                url: state.url,
                reason: Some(if state.captcha { "captcha" } else { "otp" }.into()),
            },
        )
        .await;
    }
    if !state.on_login_page {
        return finish(
            page,
            Outcome {
                logged_in: true,
                cookie_written: false,
                signed_in_now: false,
                needs_action: false,
                url: state.url,
                reason: None,
            },
        )
        .await;
    }

    // 2. Signed out. Write the stored session and ask the shop again. This is
    //    the only place a cookie reaches a browser.
    let mut cookie_written = false;
    if !cookies.is_empty() {
        crate::cookies::import(ws, cookies).await?;
        cookie_written = true;
        page.navigate(check_url).await?;
        state = page_state(&mut page).await?;
        if state.otp || state.captcha {
            return finish(
                page,
                Outcome {
                    logged_in: false,
                    cookie_written,
                    signed_in_now: false,
                    needs_action: true,
                    url: state.url,
                    reason: Some(if state.captcha { "captcha" } else { "otp" }.into()),
                },
            )
            .await;
        }
        if !state.on_login_page {
            return finish(
                page,
                Outcome {
                    logged_in: true,
                    cookie_written,
                    signed_in_now: false,
                    needs_action: false,
                    url: state.url,
                    reason: None,
                },
            )
            .await;
        }
    }

    // 3. Still signed out. Only now does the saved username and password go
    //    anywhere near the page.
    let Some(username) = username.filter(|value| !value.is_empty()) else {
        return finish(
            page,
            Outcome {
                logged_in: false,
                cookie_written,
                signed_in_now: false,
                needs_action: true,
                url: state.url,
                reason: Some("no_credentials".into()),
            },
        )
        .await;
    };
    let Some(password) = password.filter(|value| !value.is_empty()) else {
        return finish(
            page,
            Outcome {
                logged_in: false,
                cookie_written,
                signed_in_now: false,
                needs_action: true,
                url: state.url,
                reason: Some("no_credentials".into()),
            },
        )
        .await;
    };

    page.navigate(login_url).await?;
    state = page_state(&mut page).await?;
    if state.otp || state.captcha {
        return finish(
            page,
            Outcome {
                logged_in: false,
                cookie_written,
                signed_in_now: false,
                needs_action: true,
                url: state.url,
                reason: Some(if state.captcha { "captcha" } else { "otp" }.into()),
            },
        )
        .await;
    }

    let mut form = wait_for_form(&mut page, Duration::from_secs(10)).await?;
    if form.password.is_none() {
        if let Some(tab) = form.password_tab {
            // A QR-first screen: switch to the password form once, then look
            // again. If it is not there, this is a page a person has to finish.
            page.click_at(tab.0, tab.1).await?;
            sleep_ms(700).await;
            form = wait_for_form(&mut page, Duration::from_secs(5)).await?;
        }
    }

    let Some(password_at) = form.password else {
        let url = page_url(&mut page).await;
        return finish(
            page,
            Outcome {
                logged_in: false,
                cookie_written,
                signed_in_now: false,
                needs_action: true,
                url,
                reason: Some("no_form".into()),
            },
        )
        .await;
    };
    let Some(user_at) = form.user else {
        let url = page_url(&mut page).await;
        return finish(
            page,
            Outcome {
                logged_in: false,
                cookie_written,
                signed_in_now: false,
                needs_action: true,
                url,
                reason: Some("no_form".into()),
            },
        )
        .await;
    };

    // 4. Fill the form the way hands would: click, pause, clear whatever the
    //    browser filled in on focus, type with key events, pause, then submit.
    page.click_at(user_at.0, user_at.1).await?;
    sleep_ms(rng_between(250, 650)).await;
    clear_prefilled(&mut page).await?;
    page.type_human(username).await?;

    sleep_ms(rng_between(350, 900)).await;
    page.click_at(password_at.0, password_at.1).await?;
    sleep_ms(rng_between(200, 500)).await;
    clear_prefilled(&mut page).await?;
    page.type_human(password).await?;

    sleep_ms(rng_between(300, 800)).await;
    if let Some(submit) = form.submit {
        page.click_at(submit.0, submit.1).await?;
    } else {
        page.press_enter().await?;
        page.settle(Duration::from_secs(15)).await;
    }

    // 5. Give the shop time to answer. A verification page or a captcha is a
    //    stop with the browser left open; a page that left the login path is a
    //    success. Anything else is "a person has to look at this window".
    sleep_ms(rng_between(1800, 3500)).await;
    let start = Instant::now();
    loop {
        state = page_state(&mut page).await?;
        if state.otp || state.captcha {
            return finish(
                page,
                Outcome {
                    logged_in: false,
                    cookie_written,
                    signed_in_now: false,
                    needs_action: true,
                    url: state.url,
                    reason: Some(if state.captcha { "captcha" } else { "otp" }.into()),
                },
            )
            .await;
        }
        if !state.on_login_page {
            return finish(
                page,
                Outcome {
                    logged_in: true,
                    cookie_written,
                    signed_in_now: true,
                    needs_action: false,
                    url: state.url,
                    reason: None,
                },
            )
            .await;
        }
        if start.elapsed() >= CHECK_TIMEOUT {
            break;
        }
        sleep_ms(rng_between(700, 1400)).await;
    }

    finish(
        page,
        Outcome {
            logged_in: false,
            cookie_written,
            signed_in_now: false,
            needs_action: true,
            url: state.url,
            reason: Some("login_failed".into()),
        },
    )
    .await
}

async fn finish(page: Page, outcome: Outcome) -> anyhow::Result<Outcome> {
    page.detach().await;
    Ok(outcome)
}

async fn page_state(page: &mut Page) -> anyhow::Result<PageState> {
    let value = page.eval(STATE_SCRIPT).await?;
    Ok(PageState {
        url: value
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        on_login_page: value
            .get("on_login_page")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        otp: value.get("otp").and_then(Value::as_bool).unwrap_or(false),
        captcha: value
            .get("captcha")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

async fn find_form(page: &mut Page) -> anyhow::Result<Form> {
    let value = page.eval(FORM_SCRIPT).await?;
    Ok(Form {
        user: point(value.get("user")),
        password: point(value.get("password")),
        password_tab: point(value.get("password_tab")),
        submit: point(value.get("submit")),
    })
}

/// Clear what the focused field holds now, not what it held when the form
/// was found. Chromium fills a saved credential on focus, so the snapshot
/// can say "empty" while the field is already filled.
async fn clear_prefilled(page: &mut Page) -> anyhow::Result<()> {
    for _ in 0..3 {
        let state = page.eval(FOCUS_SCRIPT).await?;
        let input = state.get("input").and_then(Value::as_bool).unwrap_or(false);
        let filled = state.get("filled").and_then(Value::as_bool).unwrap_or(false);
        if !input || !filled {
            return Ok(());
        }
        page.clear_field().await?;
        // Autofill can land again right after the first clear; look once more.
        sleep_ms(rng_between(120, 280)).await;
    }
    Ok(())
}

/// The form can be client-rendered a moment after the document is complete.
async fn wait_for_form(page: &mut Page, within: Duration) -> anyhow::Result<Form> {
    let start = Instant::now();
    loop {
        let form = find_form(page).await?;
        if form.password.is_some() || form.password_tab.is_some() || start.elapsed() >= within {
            return Ok(form);
        }
        sleep_ms(300).await;
    }
}

fn point(value: Option<&Value>) -> Option<(f64, f64)> {
    let value = value?;
    Some((
        value.get("x")?.as_f64()?,
        value.get("y")?.as_f64()?,
    ))
}

async fn page_url(page: &mut Page) -> String {
    page.where_am_i()
        .await
        .get("url")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn rng_between(low: u64, high: u64) -> u64 {
    use rand::Rng;
    rand::thread_rng().gen_range(low..=high)
}

async fn sleep_ms(millis: u64) {
    tokio::time::sleep(Duration::from_millis(millis)).await;
}
