use std::io::{self, Write};
use std::path::Path;
use std::sync::atomic::AtomicBool;
use uncached_cli_bin::run_with_dependencies;
use uncached_core::{
    clean_to_trash, traverse_workspace, ProviderSet, ScanOutcome, ScanReport, ScanTarget,
    TraversalControl, TraversalOutcome,
};

fn main() {
    let workspace = std::env::current_dir().unwrap_or_else(|error| {
        eprintln!("cannot determine current workspace: {error}");
        std::process::exit(1);
    });
    let mut stdout = io::stdout();
    let mut stderr = io::stderr();
    let status = run_with_dependencies(
        std::env::args().skip(1),
        &workspace,
        |root: &Path| {
            let cancelled = AtomicBool::new(false);
            let mut candidates = Vec::new();
            let outcome = traverse_workspace(root, &ProviderSet::free(), &cancelled, |entry| {
                if let Some(category) = entry.category.clone() {
                    candidates.push(
                        ScanTarget::new(entry.path.clone(), category, 0)
                            .with_identity(entry.identity),
                    );
                    TraversalControl::Prune
                } else {
                    TraversalControl::Continue
                }
            })
            .map_err(|error| error.to_string())?;
            match outcome {
                TraversalOutcome::Cancelled => Ok(ScanOutcome::Cancelled),
                TraversalOutcome::Completed => Ok(ScanOutcome::Completed(ScanReport {
                    targets: candidates,
                    total_bytes: 0,
                })),
            }
        },
        |root, target| {
            clean_to_trash(root, &ProviderSet::free(), target)
                .map(|_| ())
                .map_err(|error| error.to_string())
        },
        || {
            let mut answer = String::new();
            io::stdin().read_line(&mut answer).map(|_| answer)
        },
        &mut stdout,
        &mut stderr,
    );
    let _ = stdout.flush();
    let _ = stderr.flush();
    std::process::exit(status);
}
