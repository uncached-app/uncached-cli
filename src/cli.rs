use std::io::Write;
use std::path::Path;
use uncached_core::{ScanOutcome, ScanTarget};

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

    for target in &report.targets {
        let _ = writeln!(
            output,
            "{} ({} bytes)",
            target.path.display(),
            target.size_bytes
        );
    }
    let _ = writeln!(output, "Total: {} bytes", report.total_bytes);
    if report.targets.is_empty() {
        return 0;
    }

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
        return 0;
    }

    for target in &report.targets {
        match clean(workspace, target) {
            Ok(()) => {
                let _ = writeln!(
                    output,
                    "Moved {} ({} bytes)",
                    target.path.display(),
                    target.size_bytes
                );
            }
            Err(error) => {
                let _ = writeln!(errors, "Failed to move {}: {error}", target.path.display());
            }
        }
    }
    0
}
