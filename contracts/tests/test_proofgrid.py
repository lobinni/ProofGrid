"""Portable behavioural tests for the ProofGrid contracts.

Runs the real contract sources (including the base64-embedded child inside the
factory) against a local GenVM emulator. No network, no node, no pytest:

    python3 contracts/tests/test_proofgrid.py

The same functions are importable by pytest if you prefer that runner.
"""

from __future__ import annotations

import hashlib
import os
import pathlib
import sys
import traceback

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from genvm_stub import (  # noqa: E402
    CHAIN,
    Revert,
    UserError,
    call,
    deploy_factory,
    embedded_child_source,
    instantiate_source,
)

DEFAULT_CONTRACTS = pathlib.Path(__file__).resolve().parent.parent
CONTRACTS = pathlib.Path(os.environ.get("PROOFGRID_CONTRACT_DIR", DEFAULT_CONTRACTS)).resolve()
FACTORY_SRC = (CONTRACTS / "task_factory.py").read_text()
CHILD_SRC = (CONTRACTS / "task_verifier.py").read_text()
HAS_PENDING_GETTER = "def get_latest_pending_task" in FACTORY_SRC

GEN = 10 ** 18
DAY = 86400

CREATOR = "0xC0FFEE0000000000000000000000000000000001"
WORKER = "0xW0RKER000000000000000000000000000000002".replace("W0RKER", "b0b0b0")
STRANGER = "0xDEAD000000000000000000000000000000000003"


# ── helpers ──────────────────────────────────────────────────────────────────


def fresh_factory():
    CHAIN.reset()
    factory, addr = deploy_factory(FACTORY_SRC)
    return factory, addr


def make_pending_task(factory, *, reward=10, deadline_in=7 * DAY, fmt="Live URL", creator=CREATOR):
    """Create pending custody; do not activate the child in the board."""
    return call(
        factory,
        "create_task",
        "Build a landing page",
        "Engineering",
        "",
        "Medium",
        "1 day",
        "Ship a responsive landing page with the agreed sections.",
        "Live URL that renders the four agreed sections on desktop and mobile.",
        fmt,
        "",
        reward,
        CHAIN.now + deadline_in,
        sender=creator,
        value=reward * GEN,
    )


def make_task(factory, **kwargs):
    """Create, then prove/activate the materialised child."""
    task = make_pending_task(factory, **kwargs)
    call(factory, "activate_task", task, sender=STRANGER)
    return task


def child_of(address):
    return CHAIN.contracts[str(address).lower()]


def expect_revert(fragment, fn, *args, **kwargs):
    try:
        fn(*args, **kwargs)
    except (Revert, UserError) as exc:
        assert fragment.lower() in str(exc).lower(), (
            f"expected revert containing {fragment!r}, got {exc!r}"
        )
        return str(exc)
    raise AssertionError(f"expected a revert containing {fragment!r}, but the call succeeded")


# ── tests ────────────────────────────────────────────────────────────────────


def test_embedded_child_matches_shipped_source():
    """The factory must carry byte-identical child source (generator output)."""
    embedded = embedded_child_source(FACTORY_SRC)
    assert embedded == CHILD_SRC, (
        "task_factory.py embeds stale child source - run python3 contracts/generate_factory.py"
    )


def test_full_lifecycle_release_to_worker():
    """create -> claim -> evidence -> verdict -> challenge window -> release."""
    factory, faddr = fresh_factory()
    task = make_task(factory, reward=25)

    escrow = call(factory, "get_escrow_status", task, sender=STRANGER)
    assert escrow["locked_amount"] == 25 * GEN, escrow
    assert escrow["released"] is False
    assert CHAIN.balance_of(faddr) == 25 * GEN, "escrow must be custodied by the factory"

    call(child_of(task), "claim_task", sender=WORKER)
    assert child_of(task).status == "claimed"

    call(child_of(task), "submit_work", "https://demo.example/landing", "All sections shipped.", sender=WORKER)
    assert child_of(task).status == "verified", "AI verdict runs inside submit_work"

    # Inside the challenge window the factory refuses to pay.
    expect_revert("not ready", call, factory, "release_funds", task, sender=STRANGER)

    settlement = call(factory, "get_settlement_status", task, sender=STRANGER)
    assert settlement["settleable"] is False and settlement["reason"] == "verified", settlement

    CHAIN.warp(DAY + 1)
    settlement = call(factory, "get_settlement_status", task, sender=STRANGER)
    assert settlement["settleable"] is True
    assert settlement["recipient"] == WORKER, settlement

    before = CHAIN.balance_of(WORKER)
    call(factory, "release_funds", task, sender=STRANGER)  # permissionless crank
    after = CHAIN.balance_of(WORKER)

    assert after - before == 25 * GEN, f"worker should receive the reward ({before} -> {after})"
    assert CHAIN.balance_of(faddr) == 0, "factory must no longer hold the escrow"
    escrow = call(factory, "get_escrow_status", task, sender=STRANGER)
    assert escrow["released"] is True and escrow["paid_to"] == WORKER, escrow

    expect_revert("already released", call, factory, "release_funds", task, sender=STRANGER)


def test_rejected_verdict_refunds_creator():
    factory, faddr = fresh_factory()
    CHAIN.llm_response = {"verified": False, "confidence": 74, "reasoning": "Key criteria are missing."}
    task = make_task(factory, reward=8)
    call(child_of(task), "claim_task", sender=WORKER)
    call(child_of(task), "submit_work", "https://demo.example/partial", "Partial work.", sender=WORKER)
    assert child_of(task).status == "rejected"

    CHAIN.warp(DAY + 1)
    before = CHAIN.balance_of(CREATOR)
    call(factory, "release_funds", task, sender=STRANGER)
    assert CHAIN.balance_of(CREATOR) - before == 8 * GEN
    assert CHAIN.balance_of(faddr) == 0


def test_cancellation_settles_escrow_back_to_creator():
    """A cancelled task is terminal and refundable - never stranded."""
    factory, faddr = fresh_factory()
    task = make_task(factory, reward=12)

    expect_revert("only the creator", call, child_of(task), "cancel_task", sender=STRANGER)

    call(child_of(task), "cancel_task", sender=CREATOR)
    assert child_of(task).status == "cancelled"

    settlement = call(factory, "get_settlement_status", task, sender=STRANGER)
    assert settlement["settleable"] is True, "cancelled escrow must settle immediately"
    assert settlement["recipient"] == CREATOR

    before = CHAIN.balance_of(CREATOR)
    call(factory, "release_funds", task, sender=STRANGER)
    assert CHAIN.balance_of(CREATOR) - before == 12 * GEN
    assert CHAIN.balance_of(faddr) == 0, "no escrow may remain after cancellation"


def test_claimed_task_cannot_be_cancelled_out_from_under_worker():
    factory, _ = fresh_factory()
    task = make_task(factory)
    call(child_of(task), "claim_task", sender=WORKER)
    expect_revert("unclaimed", call, child_of(task), "cancel_task", sender=CREATOR)


def test_expiry_settles_open_task():
    """An open task that runs past its deadline can always be retired."""
    factory, faddr = fresh_factory()
    task = make_task(factory, reward=5, deadline_in=DAY)

    expect_revert("has not passed", call, child_of(task), "expire_task", sender=STRANGER)

    CHAIN.warp(DAY + 1)
    call(child_of(task), "expire_task", sender=STRANGER)  # anyone may retire it
    assert child_of(task).status == "expired"

    before = CHAIN.balance_of(CREATOR)
    call(factory, "release_funds", task, sender=STRANGER)
    assert CHAIN.balance_of(CREATOR) - before == 5 * GEN
    assert CHAIN.balance_of(faddr) == 0, "expired escrow must not be stranded"


def test_expiry_settles_abandoned_claimed_task():
    """A worker who claims and vanishes cannot hold the escrow hostage."""
    factory, faddr = fresh_factory()
    task = make_task(factory, reward=9, deadline_in=DAY)
    call(child_of(task), "claim_task", sender=WORKER)

    CHAIN.warp(DAY + 1)
    call(child_of(task), "expire_task", sender=CREATOR)
    assert child_of(task).status == "expired"

    before = CHAIN.balance_of(CREATOR)
    call(factory, "release_funds", task, sender=STRANGER)
    assert CHAIN.balance_of(CREATOR) - before == 9 * GEN
    assert CHAIN.balance_of(faddr) == 0


def test_deadline_guards_use_canonical_chain_time():
    factory, _ = fresh_factory()
    task = make_task(factory, deadline_in=DAY)

    state = call(child_of(task), "get_task_state", sender=STRANGER)
    assert state["chain_time"] == CHAIN.now, "child must report canonical chain time"

    CHAIN.warp(DAY + 5)
    expect_revert("deadline has passed", call, child_of(task), "claim_task", sender=WORKER)

    # A task created with a past deadline is refused at the factory boundary.
    expect_revert(
        "future unix timestamp",
        call, factory, "create_task", "t", "Engineering", "", "Low", "1 day", "d",
        "criteria", "Live URL", "", 1, CHAIN.now - 10,
        sender=CREATOR, value=1 * GEN,
    )


def test_self_claim_rejected():
    factory, _ = fresh_factory()
    task = make_task(factory)
    expect_revert("cannot claim own task", call, child_of(task), "claim_task", sender=CREATOR)
    # And a second worker cannot steal an already-claimed task.
    call(child_of(task), "claim_task", sender=WORKER)
    expect_revert("not open", call, child_of(task), "claim_task", sender=STRANGER)


def test_only_worker_may_submit():
    factory, _ = fresh_factory()
    task = make_task(factory)
    call(child_of(task), "claim_task", sender=WORKER)
    expect_revert(
        "only the assigned worker",
        call, child_of(task), "submit_work", "https://demo.example/x", "", sender=STRANGER,
    )


def test_lookalike_github_hosts_rejected():
    """Canonical hostname validation, not a substring match."""
    factory, _ = fresh_factory()
    task = make_task(factory, fmt="GitHub Repository")
    call(child_of(task), "claim_task", sender=WORKER)

    bad_urls = [
        "https://github.com.evil.tld/acme/repo",   # suffix attack
        "https://evil-github.com/acme/repo",       # prefix attack
        "https://notgithub.com/acme/repo",         # contains github.com? no, but lookalike
        "https://raw.githubusercontent.com/a/b",   # different host entirely
        "http://github.com/acme/repo",             # not https
        "https://user@github.com/acme/repo",       # credentials in authority
        "https://github.com:8443/acme/repo",       # explicit port
        "https://github.com/acme",                 # not a repository path
        "https://github.com/",                     # homepage
        "https://evil.tld/?u=https://github.com/a/b",  # github.com only in the query
    ]
    for url in bad_urls:
        expect_revert(
            "canonical https://github.com",
            call, child_of(task), "submit_work", url, "note", sender=WORKER,
        )
        assert child_of(task).status == "claimed", f"state must be unchanged after {url}"

    # The canonical forms are accepted.
    for good in ["https://github.com/acme/repo", "https://www.github.com/acme/repo/tree/main"]:
        CHAIN.reset_marker = None
        f2, _ = fresh_factory()
        t2 = make_task(f2, fmt="GitHub Repository")
        call(child_of(t2), "claim_task", sender=WORKER)
        call(child_of(t2), "submit_work", good, "note", sender=WORKER)
        assert child_of(t2).status == "verified", good


def test_failed_evidence_fetch_reverts_and_keeps_escrow():
    """A transient fetch failure must not silently pass or lose custody."""
    factory, faddr = fresh_factory()
    task = make_task(factory, reward=6)
    call(child_of(task), "claim_task", sender=WORKER)

    def boom(url):
        raise RuntimeError("connection reset")

    CHAIN.web_render = boom
    expect_revert(
        "[TRANSIENT]",
        call, child_of(task), "submit_work", "https://demo.example/x", "note", sender=WORKER,
    )
    assert child_of(task).status == "claimed", "failed verification must roll the task back"
    assert CHAIN.balance_of(faddr) == 6 * GEN, "escrow stays custodied through a failed verdict"

    # Empty evidence is classified as an external (not transient) failure.
    CHAIN.web_render = lambda url: "   "
    expect_revert(
        "[EXTERNAL]",
        call, child_of(task), "submit_work", "https://demo.example/x", "note", sender=WORKER,
    )

    # Once the fetch recovers the same submission succeeds.
    CHAIN.web_render = lambda url: "Complete deliverable meeting every criterion. " * 8
    call(child_of(task), "submit_work", "https://demo.example/x", "note", sender=WORKER)
    assert child_of(task).status == "verified"


def test_malformed_ai_output_is_not_a_pass():
    factory, _ = fresh_factory()

    for payload in [
        "not json at all",
        {"confidence": 99},
        None,
        {"verified": True, "confidence": "abc", "reasoning": "looks good"},
        {"verified": "false", "confidence": 90, "reasoning": "wrong boolean type"},
        {"verified": True, "confidence": 90, "reasoning": ""},
    ]:
        f, _ = fresh_factory()
        task = make_task(f)
        call(child_of(task), "claim_task", sender=WORKER)
        CHAIN.llm_response = payload
        call(child_of(task), "submit_work", "https://demo.example/x", "note", sender=WORKER)
        status = child_of(task).status
        assert status == "rejected", f"malformed output must not pass: {payload!r}"
    del factory


def test_dispute_freezes_escrow_and_reruns_verdict():
    factory, faddr = fresh_factory()
    task = make_task(factory, reward=15)
    call(child_of(task), "claim_task", sender=WORKER)
    call(child_of(task), "submit_work", "https://demo.example/x", "note", sender=WORKER)
    assert child_of(task).status == "verified"

    expect_revert("too short", call, child_of(task), "dispute", "nope", sender=CREATOR)
    expect_revert(
        "only creator or worker",
        call, child_of(task), "dispute", "This does not meet criterion 3.", sender=STRANGER,
    )

    call(child_of(task), "dispute", "This does not meet criterion 3 at all.", sender=CREATOR)
    assert child_of(task).status == "disputed"
    assert child_of(task).verified_at == 0, "disputing must restart the challenge window"

    CHAIN.warp(2 * DAY)
    expect_revert("not settleable", call, factory, "release_funds", task, sender=STRANGER)
    assert CHAIN.balance_of(faddr) == 15 * GEN, "escrow frozen while disputed"

    CHAIN.llm_response = {"verified": False, "confidence": 81, "reasoning": "Re-review agrees with the dispute."}
    call(child_of(task), "request_verification", sender=CREATOR)
    assert child_of(task).status == "rejected"

    CHAIN.warp(DAY + 1)
    before = CHAIN.balance_of(CREATOR)
    call(factory, "release_funds", task, sender=STRANGER)
    assert CHAIN.balance_of(CREATOR) - before == 15 * GEN


def test_dispute_refused_after_window_closes():
    factory, _ = fresh_factory()
    task = make_task(factory)
    call(child_of(task), "claim_task", sender=WORKER)
    call(child_of(task), "submit_work", "https://demo.example/x", "note", sender=WORKER)
    CHAIN.warp(DAY + 1)
    expect_revert(
        "challenge window has closed",
        call, child_of(task), "dispute", "Too late to complain here.", sender=CREATOR,
    )


def test_child_deployment_failure_returns_funds():
    """If the child cannot be deployed the whole call reverts - no captured GEN."""
    factory, faddr = fresh_factory()
    CHAIN.fail_deploy = True

    expect_revert("could not be scheduled", make_task, factory, reward=30)

    assert CHAIN.balance_of(faddr) == 0, "factory must not keep value from a failed deploy"
    assert call(factory, "get_task_count", sender=STRANGER) == 0
    assert call(factory, "get_all_tasks", sender=STRANGER) == []


def test_wrong_factory_configuration_cannot_settle():
    """A child bound to another factory cannot activate or settle."""
    factory, faddr = fresh_factory()
    pending = make_pending_task(factory, reward=4)
    child_of(pending).factory = "0xfac0000000000000000000000000000000009999"
    expect_revert("wrong factory", call, factory, "activate_task", pending, sender=STRANGER)
    assert call(factory, "get_all_tasks", sender=STRANGER) == []
    assert CHAIN.balance_of(faddr) == 4 * GEN

    # Also defend at settlement time if an active child's binding changes.
    CHAIN.reset()
    factory, faddr = fresh_factory()
    task = make_task(factory, reward=4)

    # Simulate a misconfigured/re-pointed child after activation.
    child = child_of(task)
    child.factory = "0xfac0000000000000000000000000000000009999"
    child.status = "verified"
    child.worker = WORKER
    child.verified_at = CHAIN.now
    CHAIN.warp(DAY + 1)

    expect_revert("bound to factory", call, factory, "release_funds", task, sender=STRANGER)
    assert CHAIN.balance_of(faddr) == 4 * GEN, "escrow untouched when the binding is wrong"

    # An address this factory never deployed is unknown to it.
    expect_revert(
        "unknown task",
        call, factory, "release_funds", "0x000000000000000000000000000000000000dead", sender=STRANGER,
    )


def test_escrow_reads_match_across_factory_and_child():
    """Frontend, factory and child must answer identically."""
    factory, _ = fresh_factory()
    task = make_task(factory, reward=7)
    call(child_of(task), "claim_task", sender=WORKER)
    call(child_of(task), "submit_work", "https://demo.example/x", "note", sender=WORKER)
    CHAIN.warp(DAY + 1)

    child_settlement = call(child_of(task), "get_settlement", sender=STRANGER)
    factory_settlement = call(factory, "get_settlement_status", task, sender=STRANGER)
    escrow = call(factory, "get_escrow_status", task, sender=STRANGER)
    state = call(child_of(task), "get_task_state", sender=STRANGER)

    assert child_settlement["recipient"] == factory_settlement["recipient"] == WORKER
    assert child_settlement["reason"] == factory_settlement["reason"] == state["status"] == "verified"
    assert child_settlement["ready_at"] == factory_settlement["ready_at"]
    assert factory_settlement["locked_amount"] == escrow["locked_amount"] == 7 * GEN
    assert state["release_window"] == call(factory, "get_release_window", sender=STRANGER)


def test_evidence_is_private_to_the_parties():
    factory, _ = fresh_factory()
    task = make_task(factory)
    call(child_of(task), "claim_task", sender=WORKER)
    call(child_of(task), "submit_work", "https://demo.example/secret", "private note", sender=WORKER)

    outsider = call(child_of(task), "get_task_state", sender=STRANGER)
    assert outsider["submission_url"] == "[private]"
    assert outsider["submission_note"] == "[private]"

    for party in (CREATOR, WORKER):
        seen = call(child_of(task), "get_task_state", sender=party)
        assert seen["submission_url"] == "https://demo.example/secret", party
        assert seen["submission_note"] == "private note", party


def test_value_must_match_declared_reward():
    factory, faddr = fresh_factory()
    expect_revert(
        "must equal reward_amount",
        call, factory, "create_task", "t", "Engineering", "", "Low", "1 day", "d",
        "criteria text", "Live URL", "", 10, CHAIN.now + DAY,
        sender=CREATOR, value=3 * GEN,
    )
    assert CHAIN.balance_of(faddr) == 0
    expect_revert(
        "greater than zero",
        call, factory, "create_task", "t", "Engineering", "", "Low", "1 day", "d",
        "criteria text", "Live URL", "", 0, CHAIN.now + DAY,
        sender=CREATOR, value=0,
    )


def test_orphaned_child_escrow_can_be_reclaimed():
    """A registry entry whose child never materialised must not strand escrow.

    This is the failure observed on the live Studionet factory: five tasks
    recorded with 100 GEN each against addresses that hold no contract.
    """
    factory, faddr = fresh_factory()
    task = make_task(factory, reward=100)
    assert CHAIN.balance_of(faddr) == 100 * GEN

    # Simulate the orphan: the address is registered but nothing lives there.
    del CHAIN.contracts[str(task).lower()]

    # release_funds cannot help - its cross-contract view fails.
    try:
        call(factory, "release_funds", task, sender=CREATOR)
        raise AssertionError("release_funds should not settle an orphan")
    except (Revert, UserError):
        pass

    expect_revert("grace period", call, factory, "reclaim_unresolved", task, sender=CREATOR)

    CHAIN.warp(7 * DAY + 1)
    expect_revert("only the creator", call, factory, "reclaim_unresolved", task, sender=STRANGER)

    before = CHAIN.balance_of(CREATOR)
    call(factory, "reclaim_unresolved", task, sender=CREATOR)
    assert CHAIN.balance_of(CREATOR) - before == 100 * GEN, "creator must recover the escrow"
    assert CHAIN.balance_of(faddr) == 0
    escrow = call(factory, "get_escrow_status", task, sender=STRANGER)
    assert escrow["released"] is True and escrow["paid_to"] == CREATOR

    expect_revert("already released", call, factory, "reclaim_unresolved", task, sender=CREATOR)


def test_reclaim_refused_while_child_is_reachable():
    """The escape hatch must never bypass a live task."""
    factory, _ = fresh_factory()
    task = make_task(factory, reward=3)
    CHAIN.warp(7 * DAY + 1)
    expect_revert("reachable", call, factory, "reclaim_unresolved", task, sender=CREATOR)


def test_factory_records_creator_independently_of_child():
    factory, _ = fresh_factory()
    task = make_task(factory, reward=2)
    escrow = call(factory, "get_escrow_status", task, sender=STRANGER)
    assert escrow["creator"] == CREATOR
    assert escrow["created_at"] > 0



# ── runner ───────────────────────────────────────────────────────────────────


def main() -> int:
    tests = [(n, o) for n, o in sorted(globals().items()) if n.startswith("test_") and callable(o)]
    passed, failed = 0, []
    for name, fn in tests:
        CHAIN.reset()
        try:
            fn()
            passed += 1
            print(f"  PASS  {name}")
        except Exception:
            failed.append(name)
            print(f"  FAIL  {name}")
            traceback.print_exc()
    print(f"\n{passed}/{len(tests)} passed")
    if failed:
        print("failed: " + ", ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
