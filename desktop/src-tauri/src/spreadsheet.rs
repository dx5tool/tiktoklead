// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

//! Account lists read out of a spreadsheet.
//!
//! The Import Account dialog used to take text only: a paste, or a CSV/TXT
//! file decoded by the webview. A list that lives in Excel has to be read here
//! instead, because the webview has no file path and no spreadsheet parser, and
//! because a zip of XML is not something to hand to the page that renders
//! untrusted account data.
//!
//! What comes back is rows of text, not a workbook: the column mapping belongs
//! to the interface, which already recognises the same headings for CSV. Only
//! the first sheet that carries a value is read — an account list is one table,
//! and a second sheet is normally notes or a pivot of the first.
//!
//! Every cell is turned into what a person sees in Excel rather than into the
//! stored type. A phone number written as a number must not arrive as
//! `9.19814E+11`, and an integer must not gain `.0`. Leading zeroes lost by
//! Excel itself cannot be recovered.

use std::path::Path;

use calamine::{open_workbook_auto, CellErrorType, Data, ExcelDateTime, Reader};

use crate::commands::ApiErr;

/// Past this the workbook is refused before it is parsed. A list of accounts is
/// kilobytes; the limit is here so a mistyped pick cannot freeze the window.
const FILE_LIMIT: u64 = 20 * 1024 * 1024;

/// A sheet wider or longer than this is not an account list. It is checked
/// before a `Vec<Vec<String>>` is built, so a sheet addressed to the last cell
/// cannot allocate gigabytes.
const ROW_LIMIT: usize = 20_000;
const COLUMN_LIMIT: usize = 256;

/// The first non-empty sheet, as rows of displayed text.
pub fn read_rows(path: &Path) -> Result<Vec<Vec<String>>, ApiErr> {
    let size = std::fs::metadata(path)
        .map_err(|e| ApiErr::local(format!("Could not read {}: {e}", path.display())))?
        .len();
    if size > FILE_LIMIT {
        return Err(ApiErr::coded(
            "imp.fileTooLarge",
            format!(
                "{} is larger than {} MB",
                path.display(),
                FILE_LIMIT / (1024 * 1024)
            ),
        ));
    }

    let mut workbook = open_workbook_auto(path)
        .map_err(|e| ApiErr::coded("imp.xlsxUnreadable", format!("{}: {e}", path.display())))?;

    for name in workbook.sheet_names() {
        let range = match workbook.worksheet_range(&name) {
            Ok(range) => range,
            Err(_) => continue,
        };
        if range.is_empty() {
            continue;
        }
        if range.height() > ROW_LIMIT || range.width() > COLUMN_LIMIT {
            return Err(ApiErr::coded(
                "imp.xlsxTooMany",
                format!(
                    "{name} has {} rows and {} columns",
                    range.height(),
                    range.width()
                ),
            ));
        }
        let rows = rows_from_range(&range);
        if !rows.is_empty() {
            return Ok(rows);
        }
    }

    Err(ApiErr::coded(
        "imp.fileEmpty",
        "the spreadsheet has no rows",
    ))
}

/// Rows without empty ones and without empty cells at the right edge.
///
/// A range is rectangular and starts at the first used cell, so trailing empty
/// cells are padding rather than data. Empty rows are dropped for the same
/// reason the CSV reader drops them: the preview and the import count rows the
/// operator can see.
fn rows_from_range(range: &calamine::Range<Data>) -> Vec<Vec<String>> {
    range
        .rows()
        .map(|row| {
            let mut cells: Vec<String> = row.iter().map(cell_text).collect();
            while cells.last().is_some_and(|cell| cell.is_empty()) {
                cells.pop();
            }
            cells
        })
        .filter(|row| row.iter().any(|cell| !cell.is_empty()))
        .collect()
}

/// One cell as Excel would show it, without the number formatting.
fn cell_text(cell: &Data) -> String {
    match cell {
        Data::Int(value) => value.to_string(),
        Data::Float(value) => number_text(*value),
        Data::String(value) => value.clone(),
        Data::Bool(value) => {
            if *value {
                "TRUE".to_string()
            } else {
                "FALSE".to_string()
            }
        }
        Data::DateTime(value) => datetime_text(value),
        Data::DateTimeIso(value) | Data::DurationIso(value) => value.clone(),
        Data::Error(value) => error_text(value).to_string(),
        Data::Empty => String::new(),
    }
}

/// A number without the exponent Excel puts in front of long identifiers.
///
/// Only values that are exactly integral and short enough to be represented
/// exactly are printed in full; above 2^53 a float no longer carries every
/// digit, and a made-up digit is worse than the exponent.
fn number_text(value: f64) -> String {
    if value == 0.0 {
        return "0".to_string();
    }
    if value.fract() == 0.0 && value.abs() < 1e15 {
        return format!("{value:.0}");
    }
    value.to_string()
}

/// A date, a time or a duration in the form a cell displays.
fn datetime_text(value: &ExcelDateTime) -> String {
    if value.is_duration() {
        let total = (value.as_f64() * 86_400.0).round() as i64;
        return format!(
            "{:02}:{:02}:{:02}",
            total / 3600,
            (total % 3600) / 60,
            total % 60
        );
    }
    let (year, month, day, hour, minute, second, _) = value.to_ymd_hms_milli();
    if hour == 0 && minute == 0 && second == 0 {
        format!("{year:04}-{month:02}-{day:02}")
    } else {
        format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}")
    }
}

fn error_text(value: &CellErrorType) -> &'static str {
    match value {
        CellErrorType::Div0 => "#DIV/0!",
        CellErrorType::NA => "#N/A",
        CellErrorType::Name => "#NAME?",
        CellErrorType::Null => "#NULL!",
        CellErrorType::Num => "#NUM!",
        CellErrorType::Ref => "#REF!",
        CellErrorType::Value => "#VALUE!",
        CellErrorType::GettingData => "#GETTING_DATA",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whole_numbers_do_not_gain_a_decimal_or_an_exponent() {
        assert_eq!(number_text(0.0), "0");
        assert_eq!(number_text(42.0), "42");
        assert_eq!(number_text(919814123456.0), "919814123456");
        assert_eq!(number_text(1.5), "1.5");
    }

    #[test]
    fn dates_and_times_read_as_dates_and_times() {
        let day = ExcelDateTime::new(45943.0, calamine::ExcelDateTimeType::DateTime, false);
        assert_eq!(datetime_text(&day), "2025-10-13");
        let moment = ExcelDateTime::new(45943.541, calamine::ExcelDateTimeType::DateTime, false);
        assert_eq!(datetime_text(&moment), "2025-10-13 12:59:02");
    }

    #[test]
    fn rows_lose_the_padding_at_the_edge_but_keep_their_values() {
        let mut range = calamine::Range::new((0, 0), (2, 2));
        range.set_value((0, 0), Data::String("username".into()));
        range.set_value((0, 1), Data::String("password".into()));
        range.set_value((1, 0), Data::String("alice".into()));
        range.set_value((1, 1), Data::Int(123456));
        assert_eq!(
            rows_from_range(&range),
            vec![
                vec!["username".to_string(), "password".to_string()],
                vec!["alice".to_string(), "123456".to_string()],
            ]
        );
    }
}
