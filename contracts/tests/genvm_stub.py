"""A tiny, dependency-free GenVM emulator for testing ProofGrid contracts.

It implements just enough of the `genlayer` runtime surface for the contracts to
execute unmodified: storage types, gl.message, payable value accounting,
cross-contract views, child deployment, native transfers, and hooks so a test
can simulate web-fetch failures or malformed model output.

Deliberately portable: standard library only, no network, no node, no pytest.
"""

from __future__ import annotations

import base64
import copy
import hashlib
import sys
import types
from typing import Any, Callable


# ── Value types ──────────────────────────────────────────────────────────────


class Address(str):
    """Case-insensitive address, usable as a dict key like the real type."""

    def __new__(cls, value: Any = ""):
        return super().__new__(cls, str(value))

    def __eq__(self, other: Any) -> bool:
        if other is None:
            return False
        return str(self).lower() == str(other).lower()

    def __ne__(self, other: Any) -> bool:
        return not self.__eq__(other)

    def __hash__(self) -> int:
        return hash(str(self).lower())


def u256(value: Any = 0) -> int:
    v = int(value)
    if v < 0:
        raise OverflowError("u256 cannot be negative")
    return v


class DynArray(list):
    pass


class TreeMap(dict):
    def get(self, key, default=None):
        return super().get(Address(key) if isinstance(key, (str, Address)) else key, default)

    def __contains__(self, key) -> bool:
        return super().__contains__(Address(key) if isinstance(key, (str, Address)) else key)

    def __getitem__(self, key):
        return super().__getitem__(Address(key) if isinstance(key, (str, Address)) else key)

    def __setitem__(self, key, value):
        super().__setitem__(Address(key) if isinstance(key, (str, Address)) else key, value)


# ── Chain state ──────────────────────────────────────────────────────────────


class Revert(Exception):
    """Raised when a contract call reverts (assert / explicit error)."""


class UserError(Exception):
    """Mirror of gl.vm.UserError."""


class Chain:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.now = 1_800_000_000  # fixed canonical start time
        self.balances: dict[str, int] = {}
        self.contracts: dict[str, Any] = {}
        self.message_stack: list[types.SimpleNamespace] = []
        self.deploy_counter = 0
        # Test hooks
        self.fail_deploy = False
        self.web_render: Callable[[str], str] = lambda url: (
            "Example project README. Implements the requested feature, tests pass, "
            "deployment link included. " * 6
        )
        self.llm_response: Any = {
            "verified": True,
            "confidence": 88,
            "reasoning": "The evidence shows the deliverable matches every stated criterion.",
        }
        self.transfers: list[tuple[str, int]] = []

    # time
    def warp(self, seconds: int) -> None:
        self.now += seconds

    # balances
    def balance_of(self, addr: Any) -> int:
        return self.balances.get(str(Address(addr)).lower(), 0)

    def credit(self, addr: Any, amount: int) -> None:
        key = str(Address(addr)).lower()
        self.balances[key] = self.balances.get(key, 0) + amount

    def debit(self, addr: Any, amount: int) -> None:
        key = str(Address(addr)).lower()
        have = self.balances.get(key, 0)
        if have < amount:
            raise Revert(f"insufficient balance on {addr}")
        self.balances[key] = have - amount

    @property
    def message(self) -> types.SimpleNamespace:
        if not self.message_stack:
            raise Revert("no active message")
        return self.message_stack[-1]


CHAIN = Chain()


# ── Fake datetime so contracts read canonical chain time ─────────────────────


class _FakeDatetime:
    def __init__(self, ts: float):
        self._ts = ts

    @classmethod
    def now(cls, tz=None):
        return cls(CHAIN.now)

    def timestamp(self) -> float:
        return float(self._ts)

    def astimezone(self, tz=None):
        return self


_fake_datetime_module = types.ModuleType("datetime")
_fake_datetime_module.datetime = _FakeDatetime  # type: ignore[attr-defined]
_fake_datetime_module.timezone = types.SimpleNamespace(utc="UTC")  # type: ignore[attr-defined]


# ── genlayer runtime surface ─────────────────────────────────────────────────


class _ContractBase:
    pass


def _identity(fn):
    return fn


class _PublicWrite:
    def __call__(self, fn):
        return fn

    def payable(self, fn):
        return fn


class _Public:
    def __init__(self):
        self.write = _PublicWrite()
        self.view = _identity


class _MessageProxy:
    @property
    def sender_address(self):
        return CHAIN.message.sender_address

    @property
    def value(self):
        return CHAIN.message.value

    @property
    def contract_address(self):
        return CHAIN.message.contract_address


class _ViewProxy:
    def __init__(self, instance, address):
        self._instance = instance
        self._address = address

    def __getattr__(self, name):
        method = getattr(self._instance, name)

        def invoke(*args, **kwargs):
            # A cross-contract view executes with the calling contract as sender.
            CHAIN.message_stack.append(
                types.SimpleNamespace(
                    sender_address=Address(CHAIN.message.contract_address),
                    value=0,
                    contract_address=Address(self._address),
                )
            )
            try:
                return method(*args, **kwargs)
            finally:
                CHAIN.message_stack.pop()

        return invoke


class _ContractProxy:
    def __init__(self, address):
        self.address = Address(address)

    def view(self):
        instance = CHAIN.contracts.get(str(self.address).lower())
        if instance is None:
            raise Revert(f"no contract at {self.address}")
        return _ViewProxy(instance, self.address)


def _deploy_contract(code: bytes, args=None, kwargs=None, salt_nonce=0, on="finalized", value=0):
    if CHAIN.fail_deploy:
        return None
    CHAIN.deploy_counter += 1
    seed = f"child-{CHAIN.deploy_counter}-{salt_nonce}".encode()
    address = Address("0x" + hashlib.sha256(seed).hexdigest()[:40])
    instance = instantiate_source(code.decode("utf-8"), list(args or []), address)
    CHAIN.contracts[str(address).lower()] = instance
    return address


def _contract_interface(cls):
    """Mirror of @gl.evm.contract_interface: Klass(addr).emit_transfer(value=)."""

    class _Interface:
        def __init__(self, address):
            self.address = Address(address)

        def emit_transfer(self, value: int = 0):
            payer = CHAIN.message.contract_address
            CHAIN.debit(payer, value)
            CHAIN.credit(self.address, value)
            CHAIN.transfers.append((str(self.address), int(value)))

    _Interface.__name__ = getattr(cls, "__name__", "Interface")
    return _Interface


def _web_render(url: str, mode: str = "text"):
    return CHAIN.web_render(url)


def _exec_prompt(prompt: str, response_format: str | None = None):
    value = CHAIN.llm_response
    return value(prompt) if callable(value) else value


def _prompt_comparative(fn, principle: str = "", **_kwargs):
    # Single deterministic replay is enough for contract-logic tests; validator
    # disagreement is a consensus concern, not a contract-state concern.
    return fn()


def build_gl_namespace():
    gl = types.SimpleNamespace()
    gl.Contract = _ContractBase
    gl.public = _Public()
    gl.message = _MessageProxy()
    gl.deploy_contract = _deploy_contract
    gl.get_contract_at = lambda addr: _ContractProxy(addr)
    gl.evm = types.SimpleNamespace(contract_interface=_contract_interface)
    gl.nondet = types.SimpleNamespace(
        web=types.SimpleNamespace(render=_web_render),
        exec_prompt=_exec_prompt,
    )
    gl.eq_principle = types.SimpleNamespace(prompt_comparative=_prompt_comparative)
    gl.vm = types.SimpleNamespace(UserError=UserError)
    return gl


def _genlayer_exports() -> dict:
    return {
        "gl": build_gl_namespace(),
        "Address": Address,
        "u256": u256,
        "DynArray": DynArray,
        "TreeMap": TreeMap,
    }


# ── Loading contract sources ─────────────────────────────────────────────────


def _exec_source(source: str) -> dict:
    """Execute contract source with the genlayer runtime and chain clock stubbed."""
    module_globals: dict[str, Any] = {"__name__": "contract", "__builtins__": __builtins__}

    fake_genlayer = types.ModuleType("genlayer")
    for key, val in _genlayer_exports().items():
        setattr(fake_genlayer, key, val)
    fake_genlayer.__all__ = list(_genlayer_exports().keys())  # type: ignore[attr-defined]

    saved_genlayer = sys.modules.get("genlayer")
    saved_datetime = sys.modules.get("datetime")
    sys.modules["genlayer"] = fake_genlayer
    sys.modules["datetime"] = _fake_datetime_module
    try:
        # dont_inherit: this module's `from __future__ import annotations` must
        # not leak into contract code, or storage annotations become strings.
        exec(compile(source, "<contract>", "exec", dont_inherit=True), module_globals)
    finally:
        if saved_genlayer is None:
            sys.modules.pop("genlayer", None)
        else:
            sys.modules["genlayer"] = saved_genlayer
        if saved_datetime is None:
            sys.modules.pop("datetime", None)
        else:
            sys.modules["datetime"] = saved_datetime
    return module_globals


def _default_for(annotation):
    """GenVM materialises declared storage slots automatically; mirror that."""
    origin = getattr(annotation, "__origin__", annotation)
    if origin is DynArray or origin is list:
        return DynArray()
    if origin is TreeMap or origin is dict:
        return TreeMap()
    if origin is str:
        return ""
    if origin is bool:
        return False
    if origin is int or origin is u256:
        return 0
    if origin is Address:
        return Address("")
    return None


def _init_storage(instance, cls) -> None:
    for klass in reversed(getattr(cls, "__mro__", [cls])):
        for field, annotation in getattr(klass, "__annotations__", {}).items():
            if field.startswith("_"):
                continue
            instance.__dict__.setdefault(field, _default_for(annotation))


def _find_contract_class(module_globals: dict):
    for value in module_globals.values():
        if isinstance(value, type) and issubclass(value, _ContractBase) and value is not _ContractBase:
            return value
    raise Revert("no gl.Contract subclass found in source")


def instantiate_source(source: str, args: list, address: Address):
    ns = _exec_source(source)
    cls = _find_contract_class(ns)
    instance = cls.__new__(cls)
    _init_storage(instance, cls)
    CHAIN.message_stack.append(
        types.SimpleNamespace(
            sender_address=Address(CHAIN.message.contract_address) if CHAIN.message_stack else Address("0x0"),
            value=0,
            contract_address=Address(address),
        )
    )
    try:
        instance.__init__(*args)
    finally:
        CHAIN.message_stack.pop()
    instance.__dict__["_address"] = Address(address)
    return instance


def deploy_factory(factory_source: str, address: str = "0xfac0000000000000000000000000000000000001"):
    ns = _exec_source(factory_source)
    cls = _find_contract_class(ns)
    instance = cls.__new__(cls)
    _init_storage(instance, cls)
    addr = Address(address)
    CHAIN.message_stack.append(
        types.SimpleNamespace(sender_address=Address("0xdeployer"), value=0, contract_address=addr)
    )
    try:
        instance.__init__()
    finally:
        CHAIN.message_stack.pop()
    instance.__dict__["_address"] = addr
    CHAIN.contracts[str(addr).lower()] = instance
    return instance, addr


# ── Invoking contract calls ──────────────────────────────────────────────────


def _snapshot() -> dict:
    """Capture everything a revert must undo."""
    return {
        "balances": dict(CHAIN.balances),
        "contracts": dict(CHAIN.contracts),
        "transfers": list(CHAIN.transfers),
        "deploy_counter": CHAIN.deploy_counter,
        "state": {
            addr: copy.deepcopy({k: v for k, v in inst.__dict__.items() if k != "_address"})
            for addr, inst in CHAIN.contracts.items()
        },
    }


def _restore(snap: dict) -> None:
    CHAIN.balances = snap["balances"]
    CHAIN.transfers = snap["transfers"]
    CHAIN.deploy_counter = snap["deploy_counter"]
    for addr in list(CHAIN.contracts):
        if addr not in snap["contracts"]:
            del CHAIN.contracts[addr]  # undo a deployment made in the failed tx
    CHAIN.contracts.update(snap["contracts"])
    for addr, fields in snap["state"].items():
        inst = CHAIN.contracts.get(addr)
        if inst is not None:
            keep = inst.__dict__.get("_address")
            inst.__dict__.clear()
            inst.__dict__.update(fields)
            if keep is not None:
                inst.__dict__["_address"] = keep


def call(contract, method: str, *args, sender: str = "0xcaller", value: int = 0, **kwargs):
    """Invoke a contract method the way the chain would: value accounting plus
    all-or-nothing revert semantics (state and attached value are rolled back)."""
    address = contract.__dict__["_address"]
    snap = _snapshot()
    if value:
        CHAIN.credit(address, value)
    CHAIN.message_stack.append(
        types.SimpleNamespace(
            sender_address=Address(sender), value=int(value), contract_address=Address(address)
        )
    )
    try:
        return getattr(contract, method)(*args, **kwargs)
    except AssertionError as exc:
        _restore(snap)
        raise Revert(str(exc) or "assertion failed") from exc
    except (UserError, Revert):
        _restore(snap)
        raise
    finally:
        CHAIN.message_stack.pop()


def embedded_child_source(factory_source: str) -> str:
    """Decode TASK_VERIFIER_CODE_B64 out of the factory - proves the generator
    embedded exactly the child source we ship."""
    import re

    match = re.search(r'TASK_VERIFIER_CODE_B64 = "([^"]*)"', factory_source)
    if not match:
        raise Revert("TASK_VERIFIER_CODE_B64 not found in factory source")
    return base64.b64decode(match.group(1)).decode("utf-8")
