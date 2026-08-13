use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use uncached_cli_bin::{run_with_dependencies, DesktopOnlyFinding, ScanOutcome, ScanReport};
use uncached_core::{
    clean_to_trash, filesystem::directory_size_report, traverse_workspace, Category, FileIdentity,
    ProviderSet, ScanTarget, TraversalControl, TraversalOutcome,
};

/// The one category the free CLI is allowed to clean. Everything else is
/// discovered and reported, never removed here.
const FREE_CATEGORY: Category = Category::NodeModules;

struct Candidate {
    path: PathBuf,
    category: Category,
    identity: Option<FileIdentity>,
}

fn scan_workspace(root: &Path) -> Result<ScanOutcome, String> {
    let cancelled = AtomicBool::new(false);
    let mut candidates: Vec<Candidate> = Vec::new();

    // Walk once with every provider: the free cleanup and the "what else is
    // here" number come from the same pass, so the two can never disagree.
    let outcome = traverse_workspace(root, &ProviderSet::all(), &cancelled, |entry| {
        if let Some(category) = entry.category.clone() {
            candidates.push(Candidate {
                path: entry.path.clone(),
                category,
                identity: entry.identity,
            });
            TraversalControl::Prune
        } else {
            TraversalControl::Continue
        }
    })
    .map_err(|error| error.to_string())?;

    if matches!(outcome, TraversalOutcome::Cancelled) {
        return Ok(ScanOutcome::Cancelled);
    }

    let mut targets = Vec::new();
    let mut total_bytes = 0u64;
    let mut desktop_only: Vec<DesktopOnlyFinding> = Vec::new();

    for candidate in candidates {
        // A partial size is better than no size: an unreadable subtree reports
        // what it could read instead of failing the whole scan.
        let bytes = directory_size_report(&candidate.path)
            .map(|report| report.bytes)
            .unwrap_or(0);

        if candidate.category == FREE_CATEGORY {
            total_bytes += bytes;
            targets.push(
                ScanTarget::new(candidate.path, candidate.category, bytes)
                    .with_identity(candidate.identity),
            );
        } else if let Some(finding) = desktop_only
            .iter_mut()
            .find(|finding| finding.category == candidate.category)
        {
            finding.bytes += bytes;
            finding.count += 1;
        } else {
            desktop_only.push(DesktopOnlyFinding {
                category: candidate.category,
                bytes,
                count: 1,
            });
        }
    }

    Ok(ScanOutcome::Completed(ScanReport {
        targets,
        total_bytes,
        desktop_only,
    }))
}

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
        scan_workspace,
        |root, target| {
            // Cleanup keeps the free provider set: the boundary that authorizes
            // deletion stays narrower than the one that authorizes discovery.
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
