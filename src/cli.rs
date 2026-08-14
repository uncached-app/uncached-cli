use std::io::Write;
use std::path::Path;
use uncached_core::{Category, ScanTarget};

const UPGRADE_URL: &str = "https://uncached.app";

const KB: u64 = 1024;
const MB: u64 = KB * 1024;
const GB: u64 = MB * 1024;

/// What one kind of artifact weighs across the whole scan.
///
/// This used to be the opposite: a list of what the CLI found and refused to
/// clean, because only `node_modules` was free. Nothing is withheld now, so the
/// breakdown reports what is being removed instead of what is being upsold.
#[derive(Debug, Clone)]
pub struct CategorySummary {
    pub category: Category,
    pub bytes: u64,
    pub count: usize,
}

#[derive(Debug, Clone, Default)]
pub struct ScanReport {
    pub targets: Vec<ScanTarget>,
    pub total_bytes: u64,
    pub by_category: Vec<CategorySummary>,
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
        Category::XcodeDerivedData => "Xcode build data".to_owned(),
        Category::SwiftBuild => "Swift builds".to_owned(),
        Category::DartTool => "Dart tooling".to_owned(),
        Category::FlutterBuild => "Flutter build".to_owned(),
        Category::MavenTarget => "Maven target".to_owned(),
        Category::GradleBuild => "Gradle build".to_owned(),
        Category::SbtTarget => "sbt target".to_owned(),
        Category::CMakeBuild => "CMake build".to_owned(),
        Category::ZigCache => "Zig cache".to_owned(),
        Category::ElixirBuild => "Elixir _build".to_owned(),
        Category::HaskellBuild => "Haskell build".to_owned(),
        Category::NuxtCache => ".nuxt".to_owned(),
        Category::SvelteKitCache => ".svelte-kit".to_owned(),
        Category::ReactNative => "React Native build data".to_owned(),
        Category::JupyterCheckpoints => "notebook checkpoints".to_owned(),
        Category::PixiEnv => ".pixi".to_owned(),
        Category::ComposerVendor => "Composer vendor".to_owned(),
        Category::TerraformDir => ".terraform".to_owned(),
        Category::CocoapodsPods => "Pods".to_owned(),
        Category::UnityLibrary => "Unity build data".to_owned(),
        Category::UnrealIntermediate => "Unreal build data".to_owned(),
        Category::GodotCache => ".godot".to_owned(),
        // The catalogued locations live outside any workspace, so a walk from
        // here never reaches them. They are listed for the day the CLI reports
        // what the app found in the home directory.
        Category::PackageManagerCache => "package manager caches".to_owned(),
        Category::AiToolCache => "AI tool caches".to_owned(),
        Category::EditorCache => "editor caches".to_owned(),
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

/// What the scan found, one line per kind, heaviest first.
fn write_breakdown<O: Write>(output: &mut O, report: &ScanReport) {
    if report.by_category.len() < 2 {
        return;
    }
    let mut summaries = report.by_category.clone();
    summaries.sort_by_key(|summary| std::cmp::Reverse(summary.bytes));
    let width = summaries
        .iter()
        .map(|summary| category_label(&summary.category).chars().count())
        .max()
        .unwrap_or(0);

    let _ = writeln!(output);
    for summary in summaries {
        let _ = writeln!(
            output,
            "{:<width$}  {:>12}  {:>10}",
            category_label(&summary.category),
            plural(summary.count, "target"),
            format_bytes(summary.bytes)
        );
    }
}

/// The app is not a bigger version of this. It reads the same artifacts and
/// adds what a terminal cannot: which project each one belongs to, and which of
/// those projects hold work that exists nowhere else.
fn write_app_note<O: Write>(output: &mut O) {
    let _ = writeln!(output);
    let _ = writeln!(
        output,
        "Uncached for desktop maps the projects these came from, and flags the ones"
    );
    let _ = writeln!(output, "holding work that only exists on this disk: {UPGRADE_URL}");
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

    write_breakdown(output, &report);

    if report.targets.is_empty() {
        let _ = writeln!(output, "No build artifacts found.");
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
    write_app_note(output);
    0
}
