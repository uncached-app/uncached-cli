use std::io::Write;
use std::path::Path;
use uncached_core::{Category, ScanTarget};

const UPGRADE_URL: &str = "https://uncached.app";

const KB: u64 = 1024;
const MB: u64 = KB * 1024;
const GB: u64 = MB * 1024;

/// A category the free CLI never cleans, sized during the same walk. Reporting
/// it keeps the scan honest: the user sees the whole picture instead of only
/// the `node_modules` slice the CLI is allowed to remove.
#[derive(Debug, Clone)]
pub struct DesktopOnlyFinding {
    pub category: Category,
    pub bytes: u64,
    pub count: usize,
}

#[derive(Debug, Clone, Default)]
pub struct ScanReport {
    pub targets: Vec<ScanTarget>,
    pub total_bytes: u64,
    pub desktop_only: Vec<DesktopOnlyFinding>,
}

impl ScanReport {
    pub fn desktop_only_bytes(&self) -> u64 {
        self.desktop_only.iter().map(|finding| finding.bytes).sum()
    }
}

pub enum ScanOutcome {
    Completed(ScanReport),
    Cancelled,
}

/// Mirrors the desktop `formatBytes` so the same scan reads the same on both
/// surfaces.
pub fn format_bytes(bytes: u64) -> String {
    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{bytes} B")
    }
}

fn category_label(category: &Category) -> String {
    match category {
        Category::NodeModules => "node_modules".to_owned(),
        Category::CargoTarget => "Cargo target".to_owned(),
        Category::NextJs => ".next".to_owned(),
        Category::Turbo => ".turbo".to_owned(),
        Category::PyCache => "__pycache__".to_owned(),
        Category::Gradle => ".gradle".to_owned(),
        Category::DotNetObj => "bin/obj".to_owned(),
        Category::Docker => "Docker cache".to_owned(),
        Category::Custom(name) => name.clone(),
    }
}

fn plural(count: usize, singular: &str) -> String {
    if count == 1 {
        format!("{count} {singular}")
    } else {
        format!("{count} {singular}s")
    }
}

/// Prints what the CLI found but does not clean. It runs after the free work is
/// done, never before it and never in place of it.
fn write_desktop_only<O: Write>(output: &mut O, report: &ScanReport) {
    let bytes = report.desktop_only_bytes();
    if bytes == 0 {
        return;
    }
    let mut findings = report.desktop_only.clone();
    findings.sort_by_key(|finding| std::cmp::Reverse(finding.bytes));
    let labels = findings
        .iter()
        .map(|finding| category_label(&finding.category))
        .collect::<Vec<_>>()
        .join(", ");

    let _ = writeln!(output);
    let _ = writeln!(output, "Found {} more in {labels}.", format_bytes(bytes));
    let _ = writeln!(output, "The Uncached app cleans those too: {UPGRADE_URL}");
}

pub fn run_with_dependencies<I, S, C, Q, O, E>(
    args: I,
    current_workspace: &Path,
    mut scan: S,
    mut clean: C,
    mut confirm: Q,
    output: &mut O,
    errors: &mut E,
) -> i32
where
    I: IntoIterator,
    I::Item: AsRef<str>,
    S: FnMut(&Path) -> Result<ScanOutcome, String>,
    C: FnMut(&Path, &ScanTarget) -> Result<(), String>,
    Q: FnMut() -> std::io::Result<String>,
    O: Write,
    E: Write,
{
    let args = args
        .into_iter()
        .map(|arg| arg.as_ref().to_owned())
        .collect::<Vec<_>>();
    let workspace = match args.as_slice() {
        [command] if command == "scan" => current_workspace,
        [command, path] if command == "scan" => Path::new(path),
        _ => {
            let _ = writeln!(errors, "usage: uncached scan [workspace]");
            return 2;
        }
    };

    let report = match scan(workspace) {
        Ok(ScanOutcome::Completed(report)) => report,
        Ok(ScanOutcome::Cancelled) => return 0,
        Err(error) => {
            let _ = writeln!(errors, "scan failed: {error}");
            return 1;
        }
    };

    let paths = report
        .targets
        .iter()
        .map(|target| target.path.display().to_string())
        .collect::<Vec<_>>();
    let width = paths
        .iter()
        .map(|path| path.chars().count())
        .max()
        .unwrap_or(0);
    for (path, target) in paths.iter().zip(&report.targets) {
        let _ = writeln!(
            output,
            "{path:<width$}  {:>10}",
            format_bytes(target.size_bytes)
        );
    }

    if report.targets.is_empty() {
        let _ = writeln!(output, "No node_modules found.");
        write_desktop_only(output, &report);
        return 0;
    }

    let _ = writeln!(output);
    let _ = writeln!(
        output,
        "{}, {} reclaimable",
        plural(report.targets.len(), "target"),
        format_bytes(report.total_bytes)
    );
    let _ = writeln!(output);

    let _ = write!(output, "Move all targets to Trash? [y/N] ");
    let _ = output.flush();
    let answer = match confirm() {
        Ok(answer) => answer,
        Err(error) => {
            let _ = writeln!(errors, "confirmation failed: {error}");
            return 1;
        }
    };
    if answer.trim_end_matches(['\r', '\n']) != "y" {
        let _ = writeln!(output, "Cancelled.");
        write_desktop_only(output, &report);
        return 0;
    }

    let mut moved = 0usize;
    let mut freed_bytes = 0u64;
    for target in &report.targets {
        match clean(workspace, target) {
            Ok(()) => {
                moved += 1;
                freed_bytes += target.size_bytes;
                let _ = writeln!(output, "Moved {}", target.path.display());
            }
            Err(error) => {
                let _ = writeln!(errors, "Failed to move {}: {error}", target.path.display());
            }
        }
    }

    let _ = writeln!(output);
    let _ = writeln!(
        output,
        "Reclaimed {} from {}.",
        format_bytes(freed_bytes),
        plural(moved, "target")
    );
    write_desktop_only(output, &report);
    0
}
