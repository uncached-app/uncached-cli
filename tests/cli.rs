use std::fs;
use std::path::{Path, PathBuf};
use uncached_cli_bin::run_with_dependencies;
use uncached_cli_bin::{CategorySummary, ScanOutcome, ScanReport};
use uncached_core::{Category, ScanTarget};

struct FlushTrackingWriter {
    bytes: Vec<u8>,
    flushed: std::rc::Rc<std::cell::Cell<bool>>,
}

impl std::io::Write for FlushTrackingWriter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.flushed.set(true);
        Ok(())
    }
}

fn target(path: impl Into<PathBuf>, size_bytes: u64) -> ScanTarget {
    ScanTarget::new(path.into(), Category::NodeModules, size_bytes)
}

fn report(targets: Vec<ScanTarget>, total_bytes: u64) -> ScanReport {
    ScanReport {
        targets,
        total_bytes,
        ..ScanReport::default()
    }
}

fn run(
    args: &[&str],
    scan: impl FnMut(&Path) -> Result<ScanOutcome, String>,
    clean: impl FnMut(&Path, &ScanTarget) -> Result<(), String>,
    answer: &str,
) -> (i32, String, String) {
    run_at(Path::new("/workspace"), args, scan, clean, answer)
}

fn run_at(
    workspace: &Path,
    args: &[&str],
    scan: impl FnMut(&Path) -> Result<ScanOutcome, String>,
    clean: impl FnMut(&Path, &ScanTarget) -> Result<(), String>,
    answer: &str,
) -> (i32, String, String) {
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let status = run_with_dependencies(
        args.iter().copied(),
        workspace,
        scan,
        clean,
        || Ok(answer.to_owned()),
        &mut stdout,
        &mut stderr,
    );
    (
        status,
        String::from_utf8(stdout).unwrap(),
        String::from_utf8(stderr).unwrap(),
    )
}

#[test]
fn defaults_workspace_to_current_directory() {
    let mut seen = None;
    let (status, _, _) = run(
        &["scan"],
        |workspace| {
            seen = Some(workspace.to_path_buf());
            Ok(ScanOutcome::Completed(report(Vec::new(), 0)))
        },
        |_, _| panic!("empty scan must not clean"),
        "N",
    );
    assert_eq!(status, 0);
    assert_eq!(seen, Some(PathBuf::from("/workspace")));
}

#[test]
fn passes_explicit_workspace_to_core() {
    let mut seen = None;
    let (status, _, _) = run(
        &["scan", "./fixture"],
        |workspace| {
            seen = Some(workspace.to_path_buf());
            Ok(ScanOutcome::Completed(report(Vec::new(), 0)))
        },
        |_, _| panic!("empty scan must not clean"),
        "N",
    );
    assert_eq!(status, 0);
    assert_eq!(seen, Some(PathBuf::from("./fixture")));
}

#[test]
fn rejects_invalid_command_and_extra_workspace() {
    for args in [["clean"].as_slice(), &["scan", "one", "two"]].iter() {
        let (status, _, stderr) = run(
            args,
            |_| panic!("invalid args must not scan"),
            |_, _| Ok(()),
            "N",
        );
        assert_ne!(status, 0);
        assert!(stderr.contains("usage"));
    }
}

#[test]
fn prints_each_target_path_for_non_empty_scan() {
    let first = target("/workspace/a/node_modules", 12);
    let second = target("/workspace/b/node_modules", 30);
    let report = report(vec![first, second], 42);
    let (status, stdout, _) = run(
        &["scan"],
        |_| Ok(ScanOutcome::Completed(report.clone())),
        |_, _| Ok(()),
        "N",
    );
    assert_eq!(status, 0);
    assert!(stdout.contains("/workspace/a/node_modules"));
    assert!(stdout.contains("/workspace/b/node_modules"));
}

#[test]
fn asks_once_and_cleans_every_target_after_exact_lowercase_y() {
    let targets = vec![
        target("/workspace/a/node_modules", 1),
        target("/workspace/b/node_modules", 2),
    ];
    let cleaned = std::cell::RefCell::new(Vec::new());
    let (status, stdout, _) = run(
        &["scan"],
        |_| Ok(ScanOutcome::Completed(report(targets.clone(), 3))),
        |_, item| {
            cleaned.borrow_mut().push(item.path.clone());
            Ok(())
        },
        "y",
    );
    assert_eq!(status, 0);
    assert_eq!(
        *cleaned.borrow(),
        targets
            .iter()
            .map(|item| item.path.clone())
            .collect::<Vec<_>>()
    );
    assert_eq!(stdout.matches("Move all targets").count(), 1);
}

#[test]
fn flushes_confirmation_prompt_before_reading_answer() {
    let mut output = FlushTrackingWriter {
        bytes: Vec::new(),
        flushed: std::rc::Rc::new(std::cell::Cell::new(false)),
    };
    let flushed = output.flushed.clone();
    let mut errors = Vec::new();
    let status = run_with_dependencies(
        ["scan"].iter().copied(),
        Path::new("/workspace"),
        |_| {
            Ok(ScanOutcome::Completed(report(
                vec![target("/workspace/node_modules", 1)],
                1,
            )))
        },
        |_, _| Ok(()),
        || {
            assert!(flushed.get());
            Ok("N".to_owned())
        },
        &mut output,
        &mut errors,
    );
    assert_eq!(status, 0);
}

#[test]
fn cancellation_preserves_targets() {
    let cleaned = std::cell::Cell::new(0);
    let (status, _, _) = run(
        &["scan"],
        |_| {
            Ok(ScanOutcome::Completed(report(
                vec![target("/workspace/a/node_modules", 1)],
                1,
            )))
        },
        |_, _| {
            cleaned.set(cleaned.get() + 1);
            Ok(())
        },
        "Y",
    );
    assert_eq!(status, 0);
    assert_eq!(cleaned.get(), 0);
}

#[test]
fn core_cancellation_returns_success_without_report_or_cleanup() {
    let cleaned = std::cell::Cell::new(0);
    let (status, stdout, stderr) = run(
        &["scan"],
        |_| Ok(ScanOutcome::Cancelled),
        |_, _| {
            cleaned.set(cleaned.get() + 1);
            Ok(())
        },
        "y",
    );

    assert_eq!(status, 0);
    assert_eq!(cleaned.get(), 0);
    assert!(stdout.is_empty());
    assert!(stderr.is_empty());
}

#[test]
fn prints_cancellation_status_for_explicit_non_y_answer() {
    let (status, stdout, stderr) = run(
        &["scan"],
        |_| {
            Ok(ScanOutcome::Completed(report(
                vec![target("/workspace/node_modules", 1)],
                1,
            )))
        },
        |_, _| panic!("explicit cancellation must not clean"),
        "N",
    );

    assert_eq!(status, 0);
    assert!(stdout.contains("Cancelled"));
    assert!(stderr.is_empty());
}

#[test]
fn confirmation_read_error_is_nonzero_and_concise() {
    let (status, _, stderr) = run_with_confirmation(
        &["scan"],
        |_| {
            Ok(ScanOutcome::Completed(report(
                vec![target("/workspace/node_modules", 1)],
                1,
            )))
        },
        |_, _| panic!("confirmation error must not clean"),
        || {
            Err(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "stdin closed",
            ))
        },
    );

    assert_eq!(status, 1);
    assert!(stderr.contains("confirmation failed: stdin closed"));
    assert!(!stderr.contains("Cancelled"));
}

fn run_with_confirmation<S, C, Q>(
    args: &[&str],
    scan: S,
    clean: C,
    confirm: Q,
) -> (i32, String, String)
where
    S: FnMut(&Path) -> Result<ScanOutcome, String>,
    C: FnMut(&Path, &ScanTarget) -> Result<(), String>,
    Q: FnMut() -> std::io::Result<String>,
{
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let status = run_with_dependencies(
        args.iter().copied(),
        Path::new("/workspace"),
        scan,
        clean,
        confirm,
        &mut stdout,
        &mut stderr,
    );
    (
        status,
        String::from_utf8(stdout).unwrap(),
        String::from_utf8(stderr).unwrap(),
    )
}

#[test]
fn reports_cleanup_failure_and_continues() {
    let cleaned = std::cell::RefCell::new(Vec::new());
    let (status, stdout, stderr) = run(
        &["scan"],
        |_| {
            Ok(ScanOutcome::Completed(report(
                vec![
                    target("/workspace/a/node_modules", 1),
                    target("/workspace/b/node_modules", 2),
                ],
                3,
            )))
        },
        |_, item| {
            cleaned.borrow_mut().push(item.path.clone());
            if item.path.ends_with("a/node_modules") {
                Err("trash unavailable".into())
            } else {
                Ok(())
            }
        },
        "y",
    );
    assert_eq!(status, 0);
    assert_eq!(cleaned.borrow().len(), 2);
    assert!(stderr.contains("trash unavailable"));
    assert!(stdout.contains("Moved"));
}

#[test]
fn scan_failure_returns_nonzero_without_confirmation() {
    let (status, _, stderr) = run(
        &["scan"],
        |_| Err("workspace is not a directory".into()),
        |_, _| Ok(()),
        "y",
    );
    assert_ne!(status, 0);
    assert!(stderr.contains("workspace is not a directory"));
}

#[test]
fn final_cleanup_boundary_rejects_replaced_target() {
    let root = std::env::temp_dir().join(format!("uncached-cli-{}", std::process::id()));
    let project = root.join("project");
    let target_path = project.join("node_modules");
    let outside = root.join("outside");
    fs::create_dir_all(&target_path).unwrap();
    fs::create_dir_all(&outside).unwrap();
    let report_target = target(&target_path, 0);
    fs::remove_dir(&target_path).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, &target_path).unwrap();
    #[cfg(windows)]
    if std::os::windows::fs::symlink_dir(&outside, &target_path).is_err() {
        fs::remove_dir_all(root).unwrap();
        return;
    }
    let (status, _, stderr) = run_at(
        &root,
        &["scan"],
        move |_| {
            Ok(ScanOutcome::Completed(report(
                vec![report_target.clone()],
                0,
            )))
        },
        move |workspace, item| {
            uncached_core::validate_clean_target(
                workspace,
                &uncached_core::ProviderSet::free(),
                item,
            )
            .map(|_| ())
            .map_err(|error| error.to_string())
        },
        "y",
    );
    assert_eq!(status, 0);
    assert!(stderr.contains("target"));
    fs::remove_dir_all(root).unwrap();
}

fn by_category(summaries: &[(Category, u64, usize)]) -> Vec<CategorySummary> {
    summaries
        .iter()
        .map(|(category, bytes, count)| CategorySummary {
            category: category.clone(),
            bytes: *bytes,
            count: *count,
        })
        .collect()
}

#[test]
fn prints_size_per_target_and_total_before_confirmation() {
    let (status, stdout, _) = run(
        &["scan"],
        |_| {
            Ok(ScanOutcome::Completed(report(
                vec![
                    target("/workspace/a/node_modules", 2 * 1024 * 1024 * 1024),
                    target("/workspace/b/node_modules", 512 * 1024 * 1024),
                ],
                2 * 1024 * 1024 * 1024 + 512 * 1024 * 1024,
            )))
        },
        |_, _| panic!("declined cleanup must not clean"),
        "N",
    );

    assert_eq!(status, 0);
    assert!(stdout.contains("2.00 GB"));
    assert!(stdout.contains("512.00 MB"));
    assert!(stdout.contains("2 targets, 2.50 GB reclaimable"));
    let total_index = stdout.find("reclaimable").unwrap();
    let prompt_index = stdout.find("Move all targets").unwrap();
    assert!(total_index < prompt_index, "total must precede the prompt");
}

#[test]
fn reports_reclaimed_bytes_counting_only_successful_moves() {
    let (status, stdout, stderr) = run(
        &["scan"],
        |_| {
            Ok(ScanOutcome::Completed(report(
                vec![
                    target("/workspace/a/node_modules", 3 * 1024 * 1024),
                    target("/workspace/b/node_modules", 1024 * 1024),
                ],
                4 * 1024 * 1024,
            )))
        },
        |_, item| {
            if item.path.ends_with("b/node_modules") {
                Err("trash unavailable".into())
            } else {
                Ok(())
            }
        },
        "y",
    );

    assert_eq!(status, 0);
    assert!(stdout.contains("Reclaimed 3.00 MB from 1 target."));
    assert!(stderr.contains("trash unavailable"));
}

/// The CLI removes every artifact it reports. It used to clean `node_modules`
/// and upsell the rest; nothing is withheld now, so the closing note has to be
/// about what the app understands rather than about what it is allowed to
/// delete.
#[test]
fn cleans_every_kind_it_finds_and_not_only_node_modules() {
    let cleaned = std::cell::RefCell::new(Vec::new());
    let scan_report = report(
        vec![
            target("/workspace/app/node_modules", 1024),
            target("/workspace/crate/target", 2048),
            target("/workspace/game/Library", 4096),
        ],
        7168,
    );

    let (status, stdout, _) = run(
        &["scan"],
        |_| Ok(ScanOutcome::Completed(scan_report.clone())),
        |_, target| {
            cleaned.borrow_mut().push(target.path.clone());
            Ok(())
        },
        "y",
    );

    assert_eq!(status, 0);
    assert_eq!(cleaned.borrow().len(), 3, "no kind is left behind");
    assert!(stdout.contains("Reclaimed 7.00 KB from 3 targets."));
}

#[test]
fn breaks_down_the_scan_by_kind_heaviest_first() {
    let mut scan_report = report(vec![target("/workspace/a/node_modules", 1024)], 1024);
    scan_report.by_category = by_category(&[
        (Category::NextJs, 2 * 1024 * 1024 * 1024, 3),
        (Category::CargoTarget, 30 * 1024 * 1024 * 1024, 2),
    ]);

    let (status, stdout, _) = run(
        &["scan"],
        |_| Ok(ScanOutcome::Completed(scan_report.clone())),
        |_, _| Ok(()),
        "y",
    );

    assert_eq!(status, 0);
    assert!(stdout.contains("Cargo target"));
    assert!(stdout.contains("30.00 GB"));
    assert!(stdout.contains("3 targets"));
    let cargo_index = stdout.find("Cargo target").unwrap();
    let next_index = stdout.find(".next").unwrap();
    assert!(cargo_index < next_index, "heaviest kind leads");
}

/// A single kind needs no breakdown: the total below it already says the same
/// thing, and repeating it would be a table with one row.
#[test]
fn a_single_kind_gets_no_breakdown() {
    let mut scan_report = report(vec![target("/workspace/a/node_modules", 1024)], 1024);
    scan_report.by_category = by_category(&[(Category::NodeModules, 1024, 1)]);

    let (_, stdout, _) = run(
        &["scan"],
        |_| Ok(ScanOutcome::Completed(scan_report.clone())),
        |_, _| Ok(()),
        "y",
    );

    assert!(!stdout.contains("1 target  "));
}

#[test]
fn an_empty_scan_says_so_and_offers_nothing() {
    let (status, stdout, _) = run(
        &["scan"],
        |_| Ok(ScanOutcome::Completed(report(Vec::new(), 0))),
        |_, _| panic!("empty scan must not clean"),
        "N",
    );

    assert_eq!(status, 0);
    assert!(stdout.contains("No build artifacts found."));
    assert!(!stdout.contains("uncached.app"), "nothing was done to follow up on");
}

#[test]
fn a_declined_cleanup_ends_without_a_pitch() {
    let (status, stdout, _) = run(
        &["scan"],
        |_| {
            Ok(ScanOutcome::Completed(report(
                vec![target("/workspace/node_modules", 1024)],
                1024,
            )))
        },
        |_, _| panic!("declined cleanup must not clean"),
        "N",
    );

    assert_eq!(status, 0);
    assert!(stdout.contains("Cancelled."));
    assert!(!stdout.contains("uncached.app"));
}

/// The note follows the work and never precedes it.
#[test]
fn the_app_note_comes_after_the_cleanup() {
    let (status, stdout, _) = run(
        &["scan"],
        |_| {
            Ok(ScanOutcome::Completed(report(
                vec![target("/workspace/node_modules", 1024)],
                1024,
            )))
        },
        |_, _| Ok(()),
        "y",
    );

    assert_eq!(status, 0);
    let moved_index = stdout.find("Moved").unwrap();
    let note_index = stdout.find("uncached.app").unwrap();
    assert!(moved_index < note_index);
}

#[test]
fn formats_bytes_like_the_desktop() {
    assert_eq!(uncached_cli_bin::format_bytes(0), "0 B");
    assert_eq!(uncached_cli_bin::format_bytes(999), "999 B");
    assert_eq!(uncached_cli_bin::format_bytes(1024), "1.00 KB");
    assert_eq!(uncached_cli_bin::format_bytes(1024 * 1024), "1.00 MB");
    assert_eq!(
        uncached_cli_bin::format_bytes(3 * 1024 * 1024 * 1024 + 512 * 1024 * 1024),
        "3.50 GB"
    );
}
