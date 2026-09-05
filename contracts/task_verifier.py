# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# ^ "test" is the Studio runner keyword. When deploying to a live testnet
# (e.g. Bradbury), replace it with that network's pinned py-genlayer hash.

# ProofGrid - AI-verified task completion escrow
# Child intelligent contract: one instance per task, deployed by TaskFactory.
#
# DO NOT deploy this file directly in production - deploy task_factory.py and
# create tasks through create_task(); the factory embeds this source and
# deploys one child per task.

from genlayer import *

from datetime import datetime, timezone
from urllib.parse import urlparse
import json

# Error taxonomy - the prefix classifies how validators should treat a failure
# when they try to reach agreement inside the non-deterministic block:
ERROR_EXPECTED = "[EXPECTED]"    # business logic rejection - deterministic, exact match
ERROR_EXTERNAL = "[EXTERNAL]"    # upstream 4xx/empty content - deterministic, exact match
ERROR_TRANSIENT = "[TRANSIENT]"  # network/5xx - non-deterministic, agree if both transient
ERROR_LLM = "[LLM_ERROR]"        # LLM misbehavior - never agree, force leader rotation

# How long a verdict must stand undisputed before the factory may release escrow.
RELEASE_WINDOW_SECONDS = 86400  # 24 hours

# Lifecycle states. open/claimed/submitted are live; the rest are settlement
# states. cancelled and expired are terminal and always refund the creator, so
# escrow can never be stranded on a task nobody finished.
STATUS_OPEN = "open"
STATUS_CLAIMED = "claimed"
STATUS_SUBMITTED = "submitted"
STATUS_VERIFIED = "verified"
STATUS_REJECTED = "rejected"
STATUS_DISPUTED = "disputed"
STATUS_CANCELLED = "cancelled"
STATUS_EXPIRED = "expired"

# Canonical hostnames accepted for a "GitHub Repository" submission. Matching is
# done on the parsed hostname, never on a substring, so lookalikes such as
# github.com.evil.tld, evil-github.com or notgithub.com are rejected.
GITHUB_HOSTS = ("github.com", "www.github.com")


def _chain_now() -> int:
    """Canonical chain time, in unix seconds.

    GenVM injects a single transaction-wide datetime into the sandbox, so every
    validator replaying this transaction observes the same value (gltest can
    override it through the `genvm_datetime` transaction context). This is the
    ONLY time source used by the contract: every deadline, expiry and release
    guard reads it, so the factory and the child can never disagree about time.
    """
    return int(datetime.now(timezone.utc).timestamp())


def _is_canonical_github_url(raw_url: str) -> bool:
    """True only for an https://github.com/... URL with a real repository path.

    Rejects: non-https schemes, credentials in the authority (user@host),
    explicit ports, and any host that merely contains "github.com".
    """
    try:
        parsed = urlparse(raw_url.strip())
    except Exception:
        return False

    if parsed.scheme.lower() != "https":
        return False
    # netloc carries optional userinfo/port; hostname is the bare host.
    if "@" in parsed.netloc:
        return False
    if parsed.port is not None:
        return False
    host = (parsed.hostname or "").lower().rstrip(".")
    if host not in GITHUB_HOSTS:
        return False
    # Require at least /owner/repo so a bare profile or the homepage is refused.
    segments = [s for s in parsed.path.split("/") if s]
    return len(segments) >= 2


class TaskVerifier(gl.Contract):
    creator: str
    factory: str
    title: str
    category: str
    category_other: str
    priority: str
    estimated_effort: str
    description: str
    criteria: str
    submission_format: str
    submission_format_other: str
    reward_amount: u256
    deadline: u256  # unix seconds; worker must submit before this
    worker: str
    submission_url: str
    submission_note: str
    status: str
    verification_result: str  # JSON: {"verified": bool, "confidence": int, "reasoning": str}
    dispute_count: u256
    dispute_reason: str
    created_at: u256
    verified_at: u256   # when a verdict was reached; the challenge window starts here
    settled_at: u256    # when the task reached a terminal cancelled/expired state

    def __init__(
        self,
        creator: str,
        factory: str,
        title: str,
        category: str,
        category_other: str,
        priority: str,
        estimated_effort: str,
        description: str,
        criteria: str,
        submission_format: str,
        submission_format_other: str,
        reward_amount: int,
        deadline: int,
    ):
        now = _chain_now()
        assert deadline > now, (
            f"Deadline must be a future unix timestamp (received {deadline}, chain time is {now})"
        )
        assert creator != "", "Creator address is required"
        assert factory != "", "Factory address is required"
        self.creator = creator
        self.factory = factory
        self.title = title
        self.category = category
        self.category_other = category_other
        self.priority = priority
        self.estimated_effort = estimated_effort
        self.description = description
        self.criteria = criteria
        self.submission_format = submission_format
        self.submission_format_other = submission_format_other
        self.reward_amount = reward_amount
        self.deadline = deadline
        self.worker = ""
        self.submission_url = ""
        self.submission_note = ""
        self.status = STATUS_OPEN
        self.verification_result = ""
        self.dispute_count = 0
        self.dispute_reason = ""
        self.created_at = now
        self.verified_at = 0
        self.settled_at = 0

    # â”€â”€ Lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @gl.public.write
    def claim_task(self) -> None:
        caller = str(gl.message.sender_address)
        now = _chain_now()
        assert self.status == STATUS_OPEN, "Task is not open"
        assert caller != self.creator, "Creator cannot claim own task"
        assert now <= self.deadline, "Task deadline has passed"
        self.worker = caller
        self.status = STATUS_CLAIMED

    @gl.public.write
    def submit_work(self, evidence_url: str, submission_note: str) -> None:
        caller = str(gl.message.sender_address)
        now = _chain_now()
        assert caller == self.worker, "Only the assigned worker can submit"
        assert self.status == STATUS_CLAIMED, "Task must be claimed first"
        assert now <= self.deadline, "Task deadline has passed"

        cleaned = evidence_url.strip()
        lowered = cleaned.lower()
        assert lowered.startswith("http://") or lowered.startswith("https://"), \
            "Evidence must be a valid URL"

        # Deterministic format enforcement, on the parsed hostname.
        if self.submission_format == "GitHub Repository":
            assert _is_canonical_github_url(cleaned), (
                "This task expects a canonical https://github.com/<owner>/<repo> URL"
            )

        self.submission_url = cleaned
        self.submission_note = submission_note
        self.status = STATUS_SUBMITTED

        # Evidence is locked from here on, and AI verification runs immediately
        # in this same transaction so the task lands on verified/rejected
        # without any extra step.
        self._verify_submission()

    @gl.public.write
    def request_verification(self) -> None:
        # Re-runs the verdict: for a re-review after a dispute, or to retry when
        # a transient failure left the task sitting at "submitted".
        caller = str(gl.message.sender_address)
        assert caller in (self.creator, self.worker), "Only creator or worker can request verification"
        assert self.status in (STATUS_SUBMITTED, STATUS_DISPUTED), \
            "Task must be submitted or disputed to verify"
        self._verify_submission()

    @gl.public.write
    def dispute(self, reason: str) -> None:
        caller = str(gl.message.sender_address)
        now = _chain_now()
        assert caller in (self.creator, self.worker), "Only creator or worker can dispute"
        assert self.status in (STATUS_VERIFIED, STATUS_REJECTED), "Can only dispute a decided verification"
        assert len(reason.strip()) >= 8, "Dispute reason is too short"
        # A dispute is only meaningful while the escrow is still challengeable.
        assert now < self.verified_at + RELEASE_WINDOW_SECONDS, "Challenge window has closed"
        self.dispute_count += 1
        self.dispute_reason = reason
        self.status = STATUS_DISPUTED
        self.verified_at = 0  # the window restarts after the next verdict

    @gl.public.write
    def cancel_task(self) -> None:
        """Creator withdraws a task nobody has claimed. Terminal: the factory
        refunds the escrow, so cancelling can never strand funds."""
        caller = str(gl.message.sender_address)
        assert caller == self.creator, "Only the creator can cancel"
        assert self.status == STATUS_OPEN, "Only an unclaimed task can be cancelled"
        self.status = STATUS_CANCELLED
        self.settled_at = _chain_now()

    @gl.public.write
    def expire_task(self) -> None:
        """Anyone may retire a task that ran past its deadline without a
        submission. Terminal: the factory refunds the creator. This is the path
        that guarantees an open or abandoned-claimed task cannot hold escrow
        hostage forever."""
        now = _chain_now()
        assert self.status in (STATUS_OPEN, STATUS_CLAIMED), \
            "Only an open or claimed task can expire"
        assert now > self.deadline, "Task deadline has not passed yet"
        self.status = STATUS_EXPIRED
        self.settled_at = now

    # â”€â”€ Views â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @gl.public.view
    def get_task_state(self) -> dict:
        caller = str(gl.message.sender_address)
        is_party = caller == self.creator or caller == self.worker
        # Only redact once there is something real to hide.
        hide_evidence = self.submission_url != "" and not is_party
        evidence_url = "[private]" if hide_evidence else self.submission_url
        evidence_note = "[private]" if hide_evidence else self.submission_note

        return {
            "creator": self.creator,
            "factory": self.factory,
            "title": self.title,
            "category": self.category,
            "category_other": self.category_other,
            "priority": self.priority,
            "estimated_effort": self.estimated_effort,
            "description": self.description,
            "criteria": self.criteria,
            "submission_format": self.submission_format,
            "submission_format_other": self.submission_format_other,
            "reward_amount": self.reward_amount,
            "deadline": self.deadline,
            "worker": self.worker,
            "submission_url": evidence_url,
            "submission_note": evidence_note,
            "status": self.status,
            "verification_result": self.verification_result,
            "dispute_count": self.dispute_count,
            "dispute_reason": self.dispute_reason,
            "created_at": self.created_at,
            "verified_at": self.verified_at,
            "settled_at": self.settled_at,
            "release_window": RELEASE_WINDOW_SECONDS,
            "chain_time": _chain_now(),
        }

    @gl.public.view
    def get_settlement(self) -> dict:
        """The single source of truth for who the escrow belongs to and when.

        The factory reads this before paying out, so the frontend, the child and
        the factory all answer the settlement question identically.
        """
        now = _chain_now()
        status = self.status

        if status in (STATUS_CANCELLED, STATUS_EXPIRED):
            # Terminal refund: no challenge window, the creator gets it back.
            return {
                "settleable": True,
                "recipient": self.creator,
                "reason": status,
                "ready_at": self.settled_at,
                "chain_time": now,
            }

        if status in (STATUS_VERIFIED, STATUS_REJECTED):
            ready_at = int(self.verified_at) + RELEASE_WINDOW_SECONDS
            recipient = self.worker if status == STATUS_VERIFIED else self.creator
            return {
                "settleable": self.verified_at > 0 and now >= ready_at and recipient != "",
                "recipient": recipient,
                "reason": status,
                "ready_at": ready_at,
                "chain_time": now,
            }

        # open / claimed / submitted / disputed - nothing to settle yet.
        return {
            "settleable": False,
            "recipient": "",
            "reason": status,
            "ready_at": 0,
            "chain_time": now,
        }

    # â”€â”€ AI verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _verify_submission(self):
        title = self.title
        description = self.description
        criteria = self.criteria
        submission_url = self.submission_url
        submission_note = self.submission_note
        submission_format = self.submission_format_other or self.submission_format
        dispute_reason = self.dispute_reason
        is_redispute = self.dispute_count > 0

        def analyze():
            # Evidence is fetched fresh on every attempt, by every validator.
            try:
                web_data = gl.nondet.web.render(submission_url, mode="text")
            except Exception as e:
                raise gl.vm.UserError(f"{ERROR_TRANSIENT} failed to fetch {submission_url}: {e}")

            if web_data is None or len(str(web_data).strip()) == 0:
                raise gl.vm.UserError(f"{ERROR_EXTERNAL} evidence at {submission_url} is empty")

            dispute_context = ""
            if is_redispute and dispute_reason:
                dispute_context = f"""
This submission was DISPUTED by one of the parties. Re-examine the evidence
carefully in light of the dispute reason below, and do not simply repeat a
prior verdict - form your own independent judgment from the current evidence.

DISPUTE REASON: {dispute_reason}
"""

            note_context = f"\nWORKER'S NOTE: {submission_note}\n" if submission_note else ""

            prompt = f"""You are an AI reviewer verifying task completion on ProofGrid, an escrow-backed task board.

TASK TITLE: {title}
TASK DESCRIPTION: {description}
COMPLETION CRITERIA: {criteria}
EXPECTED EVIDENCE FORMAT: {submission_format}

SUBMITTED EVIDENCE URL: {submission_url}
{note_context}{dispute_context}
EVIDENCE CONTENT:
{str(web_data)[:8000]}

Analyze the evidence against the completion criteria, keeping in mind the expected
evidence format above (e.g. a GitHub repo, a live deployed app, a video, a document).
Determine if the task has been genuinely completed.

Respond in valid JSON format:
{{"verified": true/false, "confidence": 0-100, "reasoning": "detailed explanation of your verification"}}

Be strict but fair. Look for evidence that the criteria are met."""

            result = gl.nondet.exec_prompt(prompt, response_format="json")

            # The model may hand back a JSON string instead of an object.
            if isinstance(result, str):
                try:
                    result = json.loads(result)
                except Exception:
                    result = None

            # Strict schema: a truthy string such as "false", a missing/invalid
            # confidence, or empty reasoning is malformed and must never pass.
            valid = (
                isinstance(result, dict)
                and isinstance(result.get("verified"), bool)
                and isinstance(result.get("confidence"), int)
                and not isinstance(result.get("confidence"), bool)
                and isinstance(result.get("reasoning"), str)
                and len(result.get("reasoning", "").strip()) > 0
            )
            if not valid:
                return {
                    "verified": False,
                    "confidence": 0,
                    "reasoning": "AI verification produced malformed output. Manual review needed.",
                }

            confidence = max(0, min(100, result["confidence"]))
            return {
                "verified": result["verified"],
                "confidence": confidence,
                "reasoning": result["reasoning"].strip(),
            }

        # Every validator independently re-derives a verdict from freshly
        # fetched evidence and they must agree under this equivalence principle.
        parsed = gl.eq_principle.prompt_comparative(
            analyze,
            principle=(
                "`verified` must be exactly the same. `confidence` should be within "
                "15 points of each other. `reasoning` may differ in wording but should "
                "reference similar evidence."
            ),
        )

        self.verification_result = json.dumps(parsed)
        self.status = STATUS_VERIFIED if parsed.get("verified") else STATUS_REJECTED
        self.verified_at = _chain_now()
