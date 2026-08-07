use std::io::{self, Write};
use std::path::Path;
use uncached_cli_bin::run_with_dependencies;
use uncached_core::{clean_to_trash, scan_workspace, ProviderSet};

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
        |root: &Path| scan_workspace(root, &ProviderSet::free()).map_err(|error| error.to_string()),
        |root, target| {
            clean_to_trash(root, target)
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
