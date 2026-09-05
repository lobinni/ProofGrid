# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# ^ "test" is the Studio runner keyword. When deploying to a live testnet
# (e.g. Bradbury), replace it with that network's pinned py-genlayer hash.

# ProofGrid - AI-verified task completion escrow
# TaskFactory: deployed ONCE per network. It is the only address the frontend
# talks to - the money custodian and the global task registry.
#
#   create_task(...)   - payable: locks the GEN reward here and deploys one
#                        TaskVerifier child per task.
#   release_funds(a)   - settles a task: verified pays the worker; rejected,
#                        cancelled or expired refunds the creator.
#   get_all_tasks() / get_escrow_status(a) / get_settlement_status(a)
#
# TASK_VERIFIER_CODE_B64 below is generated from task_verifier.py - do not
# hand-edit it. Run `python3 contracts/generate_factory.py` after changing
# task_verifier.py to regenerate it.

from genlayer import *

from datetime import datetime, timezone
import base64

RELEASE_WINDOW_SECONDS = 86400  # 24h dispute window before escrow may move

# If a child contract never materialised (a deployment that was recorded but is
# not reachable on chain), the creator may reclaim their escrow after this
# grace period. Without it such escrow is stranded forever.
ORPHAN_GRACE_SECONDS = 7 * 86400

TASK_VERIFIER_CODE_B64 = "IyB7ICJEZXBlbmRzIjogInB5LWdlbmxheWVyOjFqYjQ1YWE4eW5oMmE5Yzl4bjNiN3FxaDhzbTVxOTNod2ZwN2pxbXdzZmhoOGpwejA5aDYiIH0KCiMgXiAidGVzdCIgaXMgdGhlIFN0dWRpbyBydW5uZXIga2V5d29yZC4gV2hlbiBkZXBsb3lpbmcgdG8gYSBsaXZlIHRlc3RuZXQKIyAoZS5nLiBCcmFkYnVyeSksIHJlcGxhY2UgaXQgd2l0aCB0aGF0IG5ldHdvcmsncyBwaW5uZWQgcHktZ2VubGF5ZXIgaGFzaC4KCiMgUHJvb2ZHcmlkIC0gQUktdmVyaWZpZWQgdGFzayBjb21wbGV0aW9uIGVzY3JvdwojIENoaWxkIGludGVsbGlnZW50IGNvbnRyYWN0OiBvbmUgaW5zdGFuY2UgcGVyIHRhc2ssIGRlcGxveWVkIGJ5IFRhc2tGYWN0b3J5LgojCiMgRE8gTk9UIGRlcGxveSB0aGlzIGZpbGUgZGlyZWN0bHkgaW4gcHJvZHVjdGlvbiAtIGRlcGxveSB0YXNrX2ZhY3RvcnkucHkgYW5kCiMgY3JlYXRlIHRhc2tzIHRocm91Z2ggY3JlYXRlX3Rhc2soKTsgdGhlIGZhY3RvcnkgZW1iZWRzIHRoaXMgc291cmNlIGFuZAojIGRlcGxveXMgb25lIGNoaWxkIHBlciB0YXNrLgoKZnJvbSBnZW5sYXllciBpbXBvcnQgKgoKZnJvbSBkYXRldGltZSBpbXBvcnQgZGF0ZXRpbWUsIHRpbWV6b25lCmZyb20gdXJsbGliLnBhcnNlIGltcG9ydCB1cmxwYXJzZQppbXBvcnQganNvbgoKIyBFcnJvciB0YXhvbm9teSAtIHRoZSBwcmVmaXggY2xhc3NpZmllcyBob3cgdmFsaWRhdG9ycyBzaG91bGQgdHJlYXQgYSBmYWlsdXJlCiMgd2hlbiB0aGV5IHRyeSB0byByZWFjaCBhZ3JlZW1lbnQgaW5zaWRlIHRoZSBub24tZGV0ZXJtaW5pc3RpYyBibG9jazoKRVJST1JfRVhQRUNURUQgPSAiW0VYUEVDVEVEXSIgICAgIyBidXNpbmVzcyBsb2dpYyByZWplY3Rpb24gLSBkZXRlcm1pbmlzdGljLCBleGFjdCBtYXRjaApFUlJPUl9FWFRFUk5BTCA9ICJbRVhURVJOQUxdIiAgICAjIHVwc3RyZWFtIDR4eC9lbXB0eSBjb250ZW50IC0gZGV0ZXJtaW5pc3RpYywgZXhhY3QgbWF0Y2gKRVJST1JfVFJBTlNJRU5UID0gIltUUkFOU0lFTlRdIiAgIyBuZXR3b3JrLzV4eCAtIG5vbi1kZXRlcm1pbmlzdGljLCBhZ3JlZSBpZiBib3RoIHRyYW5zaWVudApFUlJPUl9MTE0gPSAiW0xMTV9FUlJPUl0iICAgICAgICAjIExMTSBtaXNiZWhhdmlvciAtIG5ldmVyIGFncmVlLCBmb3JjZSBsZWFkZXIgcm90YXRpb24KCiMgSG93IGxvbmcgYSB2ZXJkaWN0IG11c3Qgc3RhbmQgdW5kaXNwdXRlZCBiZWZvcmUgdGhlIGZhY3RvcnkgbWF5IHJlbGVhc2UgZXNjcm93LgpSRUxFQVNFX1dJTkRPV19TRUNPTkRTID0gODY0MDAgICMgMjQgaG91cnMKCiMgTGlmZWN5Y2xlIHN0YXRlcy4gb3Blbi9jbGFpbWVkL3N1Ym1pdHRlZCBhcmUgbGl2ZTsgdGhlIHJlc3QgYXJlIHNldHRsZW1lbnQKIyBzdGF0ZXMuIGNhbmNlbGxlZCBhbmQgZXhwaXJlZCBhcmUgdGVybWluYWwgYW5kIGFsd2F5cyByZWZ1bmQgdGhlIGNyZWF0b3IsIHNvCiMgZXNjcm93IGNhbiBuZXZlciBiZSBzdHJhbmRlZCBvbiBhIHRhc2sgbm9ib2R5IGZpbmlzaGVkLgpTVEFUVVNfT1BFTiA9ICJvcGVuIgpTVEFUVVNfQ0xBSU1FRCA9ICJjbGFpbWVkIgpTVEFUVVNfU1VCTUlUVEVEID0gInN1Ym1pdHRlZCIKU1RBVFVTX1ZFUklGSUVEID0gInZlcmlmaWVkIgpTVEFUVVNfUkVKRUNURUQgPSAicmVqZWN0ZWQiClNUQVRVU19ESVNQVVRFRCA9ICJkaXNwdXRlZCIKU1RBVFVTX0NBTkNFTExFRCA9ICJjYW5jZWxsZWQiClNUQVRVU19FWFBJUkVEID0gImV4cGlyZWQiCgojIENhbm9uaWNhbCBob3N0bmFtZXMgYWNjZXB0ZWQgZm9yIGEgIkdpdEh1YiBSZXBvc2l0b3J5IiBzdWJtaXNzaW9uLiBNYXRjaGluZyBpcwojIGRvbmUgb24gdGhlIHBhcnNlZCBob3N0bmFtZSwgbmV2ZXIgb24gYSBzdWJzdHJpbmcsIHNvIGxvb2thbGlrZXMgc3VjaCBhcwojIGdpdGh1Yi5jb20uZXZpbC50bGQsIGV2aWwtZ2l0aHViLmNvbSBvciBub3RnaXRodWIuY29tIGFyZSByZWplY3RlZC4KR0lUSFVCX0hPU1RTID0gKCJnaXRodWIuY29tIiwgInd3dy5naXRodWIuY29tIikKCgpkZWYgX2NoYWluX25vdygpIC0+IGludDoKICAgICIiIkNhbm9uaWNhbCBjaGFpbiB0aW1lLCBpbiB1bml4IHNlY29uZHMuCgogICAgR2VuVk0gaW5qZWN0cyBhIHNpbmdsZSB0cmFuc2FjdGlvbi13aWRlIGRhdGV0aW1lIGludG8gdGhlIHNhbmRib3gsIHNvIGV2ZXJ5CiAgICB2YWxpZGF0b3IgcmVwbGF5aW5nIHRoaXMgdHJhbnNhY3Rpb24gb2JzZXJ2ZXMgdGhlIHNhbWUgdmFsdWUgKGdsdGVzdCBjYW4KICAgIG92ZXJyaWRlIGl0IHRocm91Z2ggdGhlIGBnZW52bV9kYXRldGltZWAgdHJhbnNhY3Rpb24gY29udGV4dCkuIFRoaXMgaXMgdGhlCiAgICBPTkxZIHRpbWUgc291cmNlIHVzZWQgYnkgdGhlIGNvbnRyYWN0OiBldmVyeSBkZWFkbGluZSwgZXhwaXJ5IGFuZCByZWxlYXNlCiAgICBndWFyZCByZWFkcyBpdCwgc28gdGhlIGZhY3RvcnkgYW5kIHRoZSBjaGlsZCBjYW4gbmV2ZXIgZGlzYWdyZWUgYWJvdXQgdGltZS4KICAgICIiIgogICAgcmV0dXJuIGludChkYXRldGltZS5ub3codGltZXpvbmUudXRjKS50aW1lc3RhbXAoKSkKCgpkZWYgX2lzX2Nhbm9uaWNhbF9naXRodWJfdXJsKHJhd191cmw6IHN0cikgLT4gYm9vbDoKICAgICIiIlRydWUgb25seSBmb3IgYW4gaHR0cHM6Ly9naXRodWIuY29tLy4uLiBVUkwgd2l0aCBhIHJlYWwgcmVwb3NpdG9yeSBwYXRoLgoKICAgIFJlamVjdHM6IG5vbi1odHRwcyBzY2hlbWVzLCBjcmVkZW50aWFscyBpbiB0aGUgYXV0aG9yaXR5ICh1c2VyQGhvc3QpLAogICAgZXhwbGljaXQgcG9ydHMsIGFuZCBhbnkgaG9zdCB0aGF0IG1lcmVseSBjb250YWlucyAiZ2l0aHViLmNvbSIuCiAgICAiIiIKICAgIHRyeToKICAgICAgICBwYXJzZWQgPSB1cmxwYXJzZShyYXdfdXJsLnN0cmlwKCkpCiAgICBleGNlcHQgRXhjZXB0aW9uOgogICAgICAgIHJldHVybiBGYWxzZQoKICAgIGlmIHBhcnNlZC5zY2hlbWUubG93ZXIoKSAhPSAiaHR0cHMiOgogICAgICAgIHJldHVybiBGYWxzZQogICAgIyBuZXRsb2MgY2FycmllcyBvcHRpb25hbCB1c2VyaW5mby9wb3J0OyBob3N0bmFtZSBpcyB0aGUgYmFyZSBob3N0LgogICAgaWYgIkAiIGluIHBhcnNlZC5uZXRsb2M6CiAgICAgICAgcmV0dXJuIEZhbHNlCiAgICBpZiBwYXJzZWQucG9ydCBpcyBub3QgTm9uZToKICAgICAgICByZXR1cm4gRmFsc2UKICAgIGhvc3QgPSAocGFyc2VkLmhvc3RuYW1lIG9yICIiKS5sb3dlcigpLnJzdHJpcCgiLiIpCiAgICBpZiBob3N0IG5vdCBpbiBHSVRIVUJfSE9TVFM6CiAgICAgICAgcmV0dXJuIEZhbHNlCiAgICAjIFJlcXVpcmUgYXQgbGVhc3QgL293bmVyL3JlcG8gc28gYSBiYXJlIHByb2ZpbGUgb3IgdGhlIGhvbWVwYWdlIGlzIHJlZnVzZWQuCiAgICBzZWdtZW50cyA9IFtzIGZvciBzIGluIHBhcnNlZC5wYXRoLnNwbGl0KCIvIikgaWYgc10KICAgIHJldHVybiBsZW4oc2VnbWVudHMpID49IDIKCgpjbGFzcyBUYXNrVmVyaWZpZXIoZ2wuQ29udHJhY3QpOgogICAgY3JlYXRvcjogc3RyCiAgICBmYWN0b3J5OiBzdHIKICAgIHRpdGxlOiBzdHIKICAgIGNhdGVnb3J5OiBzdHIKICAgIGNhdGVnb3J5X290aGVyOiBzdHIKICAgIHByaW9yaXR5OiBzdHIKICAgIGVzdGltYXRlZF9lZmZvcnQ6IHN0cgogICAgZGVzY3JpcHRpb246IHN0cgogICAgY3JpdGVyaWE6IHN0cgogICAgc3VibWlzc2lvbl9mb3JtYXQ6IHN0cgogICAgc3VibWlzc2lvbl9mb3JtYXRfb3RoZXI6IHN0cgogICAgcmV3YXJkX2Ftb3VudDogdTI1NgogICAgZGVhZGxpbmU6IHUyNTYgICMgdW5peCBzZWNvbmRzOyB3b3JrZXIgbXVzdCBzdWJtaXQgYmVmb3JlIHRoaXMKICAgIHdvcmtlcjogc3RyCiAgICBzdWJtaXNzaW9uX3VybDogc3RyCiAgICBzdWJtaXNzaW9uX25vdGU6IHN0cgogICAgc3RhdHVzOiBzdHIKICAgIHZlcmlmaWNhdGlvbl9yZXN1bHQ6IHN0ciAgIyBKU09OOiB7InZlcmlmaWVkIjogYm9vbCwgImNvbmZpZGVuY2UiOiBpbnQsICJyZWFzb25pbmciOiBzdHJ9CiAgICBkaXNwdXRlX2NvdW50OiB1MjU2CiAgICBkaXNwdXRlX3JlYXNvbjogc3RyCiAgICBjcmVhdGVkX2F0OiB1MjU2CiAgICB2ZXJpZmllZF9hdDogdTI1NiAgICMgd2hlbiBhIHZlcmRpY3Qgd2FzIHJlYWNoZWQ7IHRoZSBjaGFsbGVuZ2Ugd2luZG93IHN0YXJ0cyBoZXJlCiAgICBzZXR0bGVkX2F0OiB1MjU2ICAgICMgd2hlbiB0aGUgdGFzayByZWFjaGVkIGEgdGVybWluYWwgY2FuY2VsbGVkL2V4cGlyZWQgc3RhdGUKCiAgICBkZWYgX19pbml0X18oCiAgICAgICAgc2VsZiwKICAgICAgICBjcmVhdG9yOiBzdHIsCiAgICAgICAgZmFjdG9yeTogc3RyLAogICAgICAgIHRpdGxlOiBzdHIsCiAgICAgICAgY2F0ZWdvcnk6IHN0ciwKICAgICAgICBjYXRlZ29yeV9vdGhlcjogc3RyLAogICAgICAgIHByaW9yaXR5OiBzdHIsCiAgICAgICAgZXN0aW1hdGVkX2VmZm9ydDogc3RyLAogICAgICAgIGRlc2NyaXB0aW9uOiBzdHIsCiAgICAgICAgY3JpdGVyaWE6IHN0ciwKICAgICAgICBzdWJtaXNzaW9uX2Zvcm1hdDogc3RyLAogICAgICAgIHN1Ym1pc3Npb25fZm9ybWF0X290aGVyOiBzdHIsCiAgICAgICAgcmV3YXJkX2Ftb3VudDogaW50LAogICAgICAgIGRlYWRsaW5lOiBpbnQsCiAgICApOgogICAgICAgIG5vdyA9IF9jaGFpbl9ub3coKQogICAgICAgIGFzc2VydCBkZWFkbGluZSA+IG5vdywgKAogICAgICAgICAgICBmIkRlYWRsaW5lIG11c3QgYmUgYSBmdXR1cmUgdW5peCB0aW1lc3RhbXAgKHJlY2VpdmVkIHtkZWFkbGluZX0sIGNoYWluIHRpbWUgaXMge25vd30pIgogICAgICAgICkKICAgICAgICBhc3NlcnQgY3JlYXRvciAhPSAiIiwgIkNyZWF0b3IgYWRkcmVzcyBpcyByZXF1aXJlZCIKICAgICAgICBhc3NlcnQgZmFjdG9yeSAhPSAiIiwgIkZhY3RvcnkgYWRkcmVzcyBpcyByZXF1aXJlZCIKICAgICAgICBzZWxmLmNyZWF0b3IgPSBjcmVhdG9yCiAgICAgICAgc2VsZi5mYWN0b3J5ID0gZmFjdG9yeQogICAgICAgIHNlbGYudGl0bGUgPSB0aXRsZQogICAgICAgIHNlbGYuY2F0ZWdvcnkgPSBjYXRlZ29yeQogICAgICAgIHNlbGYuY2F0ZWdvcnlfb3RoZXIgPSBjYXRlZ29yeV9vdGhlcgogICAgICAgIHNlbGYucHJpb3JpdHkgPSBwcmlvcml0eQogICAgICAgIHNlbGYuZXN0aW1hdGVkX2VmZm9ydCA9IGVzdGltYXRlZF9lZmZvcnQKICAgICAgICBzZWxmLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb24KICAgICAgICBzZWxmLmNyaXRlcmlhID0gY3JpdGVyaWEKICAgICAgICBzZWxmLnN1Ym1pc3Npb25fZm9ybWF0ID0gc3VibWlzc2lvbl9mb3JtYXQKICAgICAgICBzZWxmLnN1Ym1pc3Npb25fZm9ybWF0X290aGVyID0gc3VibWlzc2lvbl9mb3JtYXRfb3RoZXIKICAgICAgICBzZWxmLnJld2FyZF9hbW91bnQgPSByZXdhcmRfYW1vdW50CiAgICAgICAgc2VsZi5kZWFkbGluZSA9IGRlYWRsaW5lCiAgICAgICAgc2VsZi53b3JrZXIgPSAiIgogICAgICAgIHNlbGYuc3VibWlzc2lvbl91cmwgPSAiIgogICAgICAgIHNlbGYuc3VibWlzc2lvbl9ub3RlID0gIiIKICAgICAgICBzZWxmLnN0YXR1cyA9IFNUQVRVU19PUEVOCiAgICAgICAgc2VsZi52ZXJpZmljYXRpb25fcmVzdWx0ID0gIiIKICAgICAgICBzZWxmLmRpc3B1dGVfY291bnQgPSAwCiAgICAgICAgc2VsZi5kaXNwdXRlX3JlYXNvbiA9ICIiCiAgICAgICAgc2VsZi5jcmVhdGVkX2F0ID0gbm93CiAgICAgICAgc2VsZi52ZXJpZmllZF9hdCA9IDAKICAgICAgICBzZWxmLnNldHRsZWRfYXQgPSAwCgogICAgIyDDouKAneKCrMOi4oCd4oKsIExpZmVjeWNsZSDDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqwKCiAgICBAZ2wucHVibGljLndyaXRlCiAgICBkZWYgY2xhaW1fdGFzayhzZWxmKSAtPiBOb25lOgogICAgICAgIGNhbGxlciA9IHN0cihnbC5tZXNzYWdlLnNlbmRlcl9hZGRyZXNzKQogICAgICAgIG5vdyA9IF9jaGFpbl9ub3coKQogICAgICAgIGFzc2VydCBzZWxmLnN0YXR1cyA9PSBTVEFUVVNfT1BFTiwgIlRhc2sgaXMgbm90IG9wZW4iCiAgICAgICAgYXNzZXJ0IGNhbGxlciAhPSBzZWxmLmNyZWF0b3IsICJDcmVhdG9yIGNhbm5vdCBjbGFpbSBvd24gdGFzayIKICAgICAgICBhc3NlcnQgbm93IDw9IHNlbGYuZGVhZGxpbmUsICJUYXNrIGRlYWRsaW5lIGhhcyBwYXNzZWQiCiAgICAgICAgc2VsZi53b3JrZXIgPSBjYWxsZXIKICAgICAgICBzZWxmLnN0YXR1cyA9IFNUQVRVU19DTEFJTUVECgogICAgQGdsLnB1YmxpYy53cml0ZQogICAgZGVmIHN1Ym1pdF93b3JrKHNlbGYsIGV2aWRlbmNlX3VybDogc3RyLCBzdWJtaXNzaW9uX25vdGU6IHN0cikgLT4gTm9uZToKICAgICAgICBjYWxsZXIgPSBzdHIoZ2wubWVzc2FnZS5zZW5kZXJfYWRkcmVzcykKICAgICAgICBub3cgPSBfY2hhaW5fbm93KCkKICAgICAgICBhc3NlcnQgY2FsbGVyID09IHNlbGYud29ya2VyLCAiT25seSB0aGUgYXNzaWduZWQgd29ya2VyIGNhbiBzdWJtaXQiCiAgICAgICAgYXNzZXJ0IHNlbGYuc3RhdHVzID09IFNUQVRVU19DTEFJTUVELCAiVGFzayBtdXN0IGJlIGNsYWltZWQgZmlyc3QiCiAgICAgICAgYXNzZXJ0IG5vdyA8PSBzZWxmLmRlYWRsaW5lLCAiVGFzayBkZWFkbGluZSBoYXMgcGFzc2VkIgoKICAgICAgICBjbGVhbmVkID0gZXZpZGVuY2VfdXJsLnN0cmlwKCkKICAgICAgICBsb3dlcmVkID0gY2xlYW5lZC5sb3dlcigpCiAgICAgICAgYXNzZXJ0IGxvd2VyZWQuc3RhcnRzd2l0aCgiaHR0cDovLyIpIG9yIGxvd2VyZWQuc3RhcnRzd2l0aCgiaHR0cHM6Ly8iKSwgXAogICAgICAgICAgICAiRXZpZGVuY2UgbXVzdCBiZSBhIHZhbGlkIFVSTCIKCiAgICAgICAgIyBEZXRlcm1pbmlzdGljIGZvcm1hdCBlbmZvcmNlbWVudCwgb24gdGhlIHBhcnNlZCBob3N0bmFtZS4KICAgICAgICBpZiBzZWxmLnN1Ym1pc3Npb25fZm9ybWF0ID09ICJHaXRIdWIgUmVwb3NpdG9yeSI6CiAgICAgICAgICAgIGFzc2VydCBfaXNfY2Fub25pY2FsX2dpdGh1Yl91cmwoY2xlYW5lZCksICgKICAgICAgICAgICAgICAgICJUaGlzIHRhc2sgZXhwZWN0cyBhIGNhbm9uaWNhbCBodHRwczovL2dpdGh1Yi5jb20vPG93bmVyPi88cmVwbz4gVVJMIgogICAgICAgICAgICApCgogICAgICAgIHNlbGYuc3VibWlzc2lvbl91cmwgPSBjbGVhbmVkCiAgICAgICAgc2VsZi5zdWJtaXNzaW9uX25vdGUgPSBzdWJtaXNzaW9uX25vdGUKICAgICAgICBzZWxmLnN0YXR1cyA9IFNUQVRVU19TVUJNSVRURUQKCiAgICAgICAgIyBFdmlkZW5jZSBpcyBsb2NrZWQgZnJvbSBoZXJlIG9uLCBhbmQgQUkgdmVyaWZpY2F0aW9uIHJ1bnMgaW1tZWRpYXRlbHkKICAgICAgICAjIGluIHRoaXMgc2FtZSB0cmFuc2FjdGlvbiBzbyB0aGUgdGFzayBsYW5kcyBvbiB2ZXJpZmllZC9yZWplY3RlZAogICAgICAgICMgd2l0aG91dCBhbnkgZXh0cmEgc3RlcC4KICAgICAgICBzZWxmLl92ZXJpZnlfc3VibWlzc2lvbigpCgogICAgQGdsLnB1YmxpYy53cml0ZQogICAgZGVmIHJlcXVlc3RfdmVyaWZpY2F0aW9uKHNlbGYpIC0+IE5vbmU6CiAgICAgICAgIyBSZS1ydW5zIHRoZSB2ZXJkaWN0OiBmb3IgYSByZS1yZXZpZXcgYWZ0ZXIgYSBkaXNwdXRlLCBvciB0byByZXRyeSB3aGVuCiAgICAgICAgIyBhIHRyYW5zaWVudCBmYWlsdXJlIGxlZnQgdGhlIHRhc2sgc2l0dGluZyBhdCAic3VibWl0dGVkIi4KICAgICAgICBjYWxsZXIgPSBzdHIoZ2wubWVzc2FnZS5zZW5kZXJfYWRkcmVzcykKICAgICAgICBhc3NlcnQgY2FsbGVyIGluIChzZWxmLmNyZWF0b3IsIHNlbGYud29ya2VyKSwgIk9ubHkgY3JlYXRvciBvciB3b3JrZXIgY2FuIHJlcXVlc3QgdmVyaWZpY2F0aW9uIgogICAgICAgIGFzc2VydCBzZWxmLnN0YXR1cyBpbiAoU1RBVFVTX1NVQk1JVFRFRCwgU1RBVFVTX0RJU1BVVEVEKSwgXAogICAgICAgICAgICAiVGFzayBtdXN0IGJlIHN1Ym1pdHRlZCBvciBkaXNwdXRlZCB0byB2ZXJpZnkiCiAgICAgICAgc2VsZi5fdmVyaWZ5X3N1Ym1pc3Npb24oKQoKICAgIEBnbC5wdWJsaWMud3JpdGUKICAgIGRlZiBkaXNwdXRlKHNlbGYsIHJlYXNvbjogc3RyKSAtPiBOb25lOgogICAgICAgIGNhbGxlciA9IHN0cihnbC5tZXNzYWdlLnNlbmRlcl9hZGRyZXNzKQogICAgICAgIG5vdyA9IF9jaGFpbl9ub3coKQogICAgICAgIGFzc2VydCBjYWxsZXIgaW4gKHNlbGYuY3JlYXRvciwgc2VsZi53b3JrZXIpLCAiT25seSBjcmVhdG9yIG9yIHdvcmtlciBjYW4gZGlzcHV0ZSIKICAgICAgICBhc3NlcnQgc2VsZi5zdGF0dXMgaW4gKFNUQVRVU19WRVJJRklFRCwgU1RBVFVTX1JFSkVDVEVEKSwgIkNhbiBvbmx5IGRpc3B1dGUgYSBkZWNpZGVkIHZlcmlmaWNhdGlvbiIKICAgICAgICBhc3NlcnQgbGVuKHJlYXNvbi5zdHJpcCgpKSA+PSA4LCAiRGlzcHV0ZSByZWFzb24gaXMgdG9vIHNob3J0IgogICAgICAgICMgQSBkaXNwdXRlIGlzIG9ubHkgbWVhbmluZ2Z1bCB3aGlsZSB0aGUgZXNjcm93IGlzIHN0aWxsIGNoYWxsZW5nZWFibGUuCiAgICAgICAgYXNzZXJ0IG5vdyA8IHNlbGYudmVyaWZpZWRfYXQgKyBSRUxFQVNFX1dJTkRPV19TRUNPTkRTLCAiQ2hhbGxlbmdlIHdpbmRvdyBoYXMgY2xvc2VkIgogICAgICAgIHNlbGYuZGlzcHV0ZV9jb3VudCArPSAxCiAgICAgICAgc2VsZi5kaXNwdXRlX3JlYXNvbiA9IHJlYXNvbgogICAgICAgIHNlbGYuc3RhdHVzID0gU1RBVFVTX0RJU1BVVEVECiAgICAgICAgc2VsZi52ZXJpZmllZF9hdCA9IDAgICMgdGhlIHdpbmRvdyByZXN0YXJ0cyBhZnRlciB0aGUgbmV4dCB2ZXJkaWN0CgogICAgQGdsLnB1YmxpYy53cml0ZQogICAgZGVmIGNhbmNlbF90YXNrKHNlbGYpIC0+IE5vbmU6CiAgICAgICAgIiIiQ3JlYXRvciB3aXRoZHJhd3MgYSB0YXNrIG5vYm9keSBoYXMgY2xhaW1lZC4gVGVybWluYWw6IHRoZSBmYWN0b3J5CiAgICAgICAgcmVmdW5kcyB0aGUgZXNjcm93LCBzbyBjYW5jZWxsaW5nIGNhbiBuZXZlciBzdHJhbmQgZnVuZHMuIiIiCiAgICAgICAgY2FsbGVyID0gc3RyKGdsLm1lc3NhZ2Uuc2VuZGVyX2FkZHJlc3MpCiAgICAgICAgYXNzZXJ0IGNhbGxlciA9PSBzZWxmLmNyZWF0b3IsICJPbmx5IHRoZSBjcmVhdG9yIGNhbiBjYW5jZWwiCiAgICAgICAgYXNzZXJ0IHNlbGYuc3RhdHVzID09IFNUQVRVU19PUEVOLCAiT25seSBhbiB1bmNsYWltZWQgdGFzayBjYW4gYmUgY2FuY2VsbGVkIgogICAgICAgIHNlbGYuc3RhdHVzID0gU1RBVFVTX0NBTkNFTExFRAogICAgICAgIHNlbGYuc2V0dGxlZF9hdCA9IF9jaGFpbl9ub3coKQoKICAgIEBnbC5wdWJsaWMud3JpdGUKICAgIGRlZiBleHBpcmVfdGFzayhzZWxmKSAtPiBOb25lOgogICAgICAgICIiIkFueW9uZSBtYXkgcmV0aXJlIGEgdGFzayB0aGF0IHJhbiBwYXN0IGl0cyBkZWFkbGluZSB3aXRob3V0IGEKICAgICAgICBzdWJtaXNzaW9uLiBUZXJtaW5hbDogdGhlIGZhY3RvcnkgcmVmdW5kcyB0aGUgY3JlYXRvci4gVGhpcyBpcyB0aGUgcGF0aAogICAgICAgIHRoYXQgZ3VhcmFudGVlcyBhbiBvcGVuIG9yIGFiYW5kb25lZC1jbGFpbWVkIHRhc2sgY2Fubm90IGhvbGQgZXNjcm93CiAgICAgICAgaG9zdGFnZSBmb3JldmVyLiIiIgogICAgICAgIG5vdyA9IF9jaGFpbl9ub3coKQogICAgICAgIGFzc2VydCBzZWxmLnN0YXR1cyBpbiAoU1RBVFVTX09QRU4sIFNUQVRVU19DTEFJTUVEKSwgXAogICAgICAgICAgICAiT25seSBhbiBvcGVuIG9yIGNsYWltZWQgdGFzayBjYW4gZXhwaXJlIgogICAgICAgIGFzc2VydCBub3cgPiBzZWxmLmRlYWRsaW5lLCAiVGFzayBkZWFkbGluZSBoYXMgbm90IHBhc3NlZCB5ZXQiCiAgICAgICAgc2VsZi5zdGF0dXMgPSBTVEFUVVNfRVhQSVJFRAogICAgICAgIHNlbGYuc2V0dGxlZF9hdCA9IG5vdwoKICAgICMgw6LigJ3igqzDouKAneKCrCBWaWV3cyDDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrAoKICAgIEBnbC5wdWJsaWMudmlldwogICAgZGVmIGdldF90YXNrX3N0YXRlKHNlbGYpIC0+IGRpY3Q6CiAgICAgICAgY2FsbGVyID0gc3RyKGdsLm1lc3NhZ2Uuc2VuZGVyX2FkZHJlc3MpCiAgICAgICAgaXNfcGFydHkgPSBjYWxsZXIgPT0gc2VsZi5jcmVhdG9yIG9yIGNhbGxlciA9PSBzZWxmLndvcmtlcgogICAgICAgICMgT25seSByZWRhY3Qgb25jZSB0aGVyZSBpcyBzb21ldGhpbmcgcmVhbCB0byBoaWRlLgogICAgICAgIGhpZGVfZXZpZGVuY2UgPSBzZWxmLnN1Ym1pc3Npb25fdXJsICE9ICIiIGFuZCBub3QgaXNfcGFydHkKICAgICAgICBldmlkZW5jZV91cmwgPSAiW3ByaXZhdGVdIiBpZiBoaWRlX2V2aWRlbmNlIGVsc2Ugc2VsZi5zdWJtaXNzaW9uX3VybAogICAgICAgIGV2aWRlbmNlX25vdGUgPSAiW3ByaXZhdGVdIiBpZiBoaWRlX2V2aWRlbmNlIGVsc2Ugc2VsZi5zdWJtaXNzaW9uX25vdGUKCiAgICAgICAgcmV0dXJuIHsKICAgICAgICAgICAgImNyZWF0b3IiOiBzZWxmLmNyZWF0b3IsCiAgICAgICAgICAgICJmYWN0b3J5Ijogc2VsZi5mYWN0b3J5LAogICAgICAgICAgICAidGl0bGUiOiBzZWxmLnRpdGxlLAogICAgICAgICAgICAiY2F0ZWdvcnkiOiBzZWxmLmNhdGVnb3J5LAogICAgICAgICAgICAiY2F0ZWdvcnlfb3RoZXIiOiBzZWxmLmNhdGVnb3J5X290aGVyLAogICAgICAgICAgICAicHJpb3JpdHkiOiBzZWxmLnByaW9yaXR5LAogICAgICAgICAgICAiZXN0aW1hdGVkX2VmZm9ydCI6IHNlbGYuZXN0aW1hdGVkX2VmZm9ydCwKICAgICAgICAgICAgImRlc2NyaXB0aW9uIjogc2VsZi5kZXNjcmlwdGlvbiwKICAgICAgICAgICAgImNyaXRlcmlhIjogc2VsZi5jcml0ZXJpYSwKICAgICAgICAgICAgInN1Ym1pc3Npb25fZm9ybWF0Ijogc2VsZi5zdWJtaXNzaW9uX2Zvcm1hdCwKICAgICAgICAgICAgInN1Ym1pc3Npb25fZm9ybWF0X290aGVyIjogc2VsZi5zdWJtaXNzaW9uX2Zvcm1hdF9vdGhlciwKICAgICAgICAgICAgInJld2FyZF9hbW91bnQiOiBzZWxmLnJld2FyZF9hbW91bnQsCiAgICAgICAgICAgICJkZWFkbGluZSI6IHNlbGYuZGVhZGxpbmUsCiAgICAgICAgICAgICJ3b3JrZXIiOiBzZWxmLndvcmtlciwKICAgICAgICAgICAgInN1Ym1pc3Npb25fdXJsIjogZXZpZGVuY2VfdXJsLAogICAgICAgICAgICAic3VibWlzc2lvbl9ub3RlIjogZXZpZGVuY2Vfbm90ZSwKICAgICAgICAgICAgInN0YXR1cyI6IHNlbGYuc3RhdHVzLAogICAgICAgICAgICAidmVyaWZpY2F0aW9uX3Jlc3VsdCI6IHNlbGYudmVyaWZpY2F0aW9uX3Jlc3VsdCwKICAgICAgICAgICAgImRpc3B1dGVfY291bnQiOiBzZWxmLmRpc3B1dGVfY291bnQsCiAgICAgICAgICAgICJkaXNwdXRlX3JlYXNvbiI6IHNlbGYuZGlzcHV0ZV9yZWFzb24sCiAgICAgICAgICAgICJjcmVhdGVkX2F0Ijogc2VsZi5jcmVhdGVkX2F0LAogICAgICAgICAgICAidmVyaWZpZWRfYXQiOiBzZWxmLnZlcmlmaWVkX2F0LAogICAgICAgICAgICAic2V0dGxlZF9hdCI6IHNlbGYuc2V0dGxlZF9hdCwKICAgICAgICAgICAgInJlbGVhc2Vfd2luZG93IjogUkVMRUFTRV9XSU5ET1dfU0VDT05EUywKICAgICAgICAgICAgImNoYWluX3RpbWUiOiBfY2hhaW5fbm93KCksCiAgICAgICAgfQoKICAgIEBnbC5wdWJsaWMudmlldwogICAgZGVmIGdldF9zZXR0bGVtZW50KHNlbGYpIC0+IGRpY3Q6CiAgICAgICAgIiIiVGhlIHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIHdobyB0aGUgZXNjcm93IGJlbG9uZ3MgdG8gYW5kIHdoZW4uCgogICAgICAgIFRoZSBmYWN0b3J5IHJlYWRzIHRoaXMgYmVmb3JlIHBheWluZyBvdXQsIHNvIHRoZSBmcm9udGVuZCwgdGhlIGNoaWxkIGFuZAogICAgICAgIHRoZSBmYWN0b3J5IGFsbCBhbnN3ZXIgdGhlIHNldHRsZW1lbnQgcXVlc3Rpb24gaWRlbnRpY2FsbHkuCiAgICAgICAgIiIiCiAgICAgICAgbm93ID0gX2NoYWluX25vdygpCiAgICAgICAgc3RhdHVzID0gc2VsZi5zdGF0dXMKCiAgICAgICAgaWYgc3RhdHVzIGluIChTVEFUVVNfQ0FOQ0VMTEVELCBTVEFUVVNfRVhQSVJFRCk6CiAgICAgICAgICAgICMgVGVybWluYWwgcmVmdW5kOiBubyBjaGFsbGVuZ2Ugd2luZG93LCB0aGUgY3JlYXRvciBnZXRzIGl0IGJhY2suCiAgICAgICAgICAgIHJldHVybiB7CiAgICAgICAgICAgICAgICAic2V0dGxlYWJsZSI6IFRydWUsCiAgICAgICAgICAgICAgICAicmVjaXBpZW50Ijogc2VsZi5jcmVhdG9yLAogICAgICAgICAgICAgICAgInJlYXNvbiI6IHN0YXR1cywKICAgICAgICAgICAgICAgICJyZWFkeV9hdCI6IHNlbGYuc2V0dGxlZF9hdCwKICAgICAgICAgICAgICAgICJjaGFpbl90aW1lIjogbm93LAogICAgICAgICAgICB9CgogICAgICAgIGlmIHN0YXR1cyBpbiAoU1RBVFVTX1ZFUklGSUVELCBTVEFUVVNfUkVKRUNURUQpOgogICAgICAgICAgICByZWFkeV9hdCA9IGludChzZWxmLnZlcmlmaWVkX2F0KSArIFJFTEVBU0VfV0lORE9XX1NFQ09ORFMKICAgICAgICAgICAgcmVjaXBpZW50ID0gc2VsZi53b3JrZXIgaWYgc3RhdHVzID09IFNUQVRVU19WRVJJRklFRCBlbHNlIHNlbGYuY3JlYXRvcgogICAgICAgICAgICByZXR1cm4gewogICAgICAgICAgICAgICAgInNldHRsZWFibGUiOiBzZWxmLnZlcmlmaWVkX2F0ID4gMCBhbmQgbm93ID49IHJlYWR5X2F0IGFuZCByZWNpcGllbnQgIT0gIiIsCiAgICAgICAgICAgICAgICAicmVjaXBpZW50IjogcmVjaXBpZW50LAogICAgICAgICAgICAgICAgInJlYXNvbiI6IHN0YXR1cywKICAgICAgICAgICAgICAgICJyZWFkeV9hdCI6IHJlYWR5X2F0LAogICAgICAgICAgICAgICAgImNoYWluX3RpbWUiOiBub3csCiAgICAgICAgICAgIH0KCiAgICAgICAgIyBvcGVuIC8gY2xhaW1lZCAvIHN1Ym1pdHRlZCAvIGRpc3B1dGVkIC0gbm90aGluZyB0byBzZXR0bGUgeWV0LgogICAgICAgIHJldHVybiB7CiAgICAgICAgICAgICJzZXR0bGVhYmxlIjogRmFsc2UsCiAgICAgICAgICAgICJyZWNpcGllbnQiOiAiIiwKICAgICAgICAgICAgInJlYXNvbiI6IHN0YXR1cywKICAgICAgICAgICAgInJlYWR5X2F0IjogMCwKICAgICAgICAgICAgImNoYWluX3RpbWUiOiBub3csCiAgICAgICAgfQoKICAgICMgw6LigJ3igqzDouKAneKCrCBBSSB2ZXJpZmljYXRpb24gw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsw6LigJ3igqzDouKAneKCrMOi4oCd4oKsCgogICAgZGVmIF92ZXJpZnlfc3VibWlzc2lvbihzZWxmKToKICAgICAgICB0aXRsZSA9IHNlbGYudGl0bGUKICAgICAgICBkZXNjcmlwdGlvbiA9IHNlbGYuZGVzY3JpcHRpb24KICAgICAgICBjcml0ZXJpYSA9IHNlbGYuY3JpdGVyaWEKICAgICAgICBzdWJtaXNzaW9uX3VybCA9IHNlbGYuc3VibWlzc2lvbl91cmwKICAgICAgICBzdWJtaXNzaW9uX25vdGUgPSBzZWxmLnN1Ym1pc3Npb25fbm90ZQogICAgICAgIHN1Ym1pc3Npb25fZm9ybWF0ID0gc2VsZi5zdWJtaXNzaW9uX2Zvcm1hdF9vdGhlciBvciBzZWxmLnN1Ym1pc3Npb25fZm9ybWF0CiAgICAgICAgZGlzcHV0ZV9yZWFzb24gPSBzZWxmLmRpc3B1dGVfcmVhc29uCiAgICAgICAgaXNfcmVkaXNwdXRlID0gc2VsZi5kaXNwdXRlX2NvdW50ID4gMAoKICAgICAgICBkZWYgYW5hbHl6ZSgpOgogICAgICAgICAgICAjIEV2aWRlbmNlIGlzIGZldGNoZWQgZnJlc2ggb24gZXZlcnkgYXR0ZW1wdCwgYnkgZXZlcnkgdmFsaWRhdG9yLgogICAgICAgICAgICB0cnk6CiAgICAgICAgICAgICAgICB3ZWJfZGF0YSA9IGdsLm5vbmRldC53ZWIucmVuZGVyKHN1Ym1pc3Npb25fdXJsLCBtb2RlPSJ0ZXh0IikKICAgICAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgICAgICAgICAgcmFpc2UgZ2wudm0uVXNlckVycm9yKGYie0VSUk9SX1RSQU5TSUVOVH0gZmFpbGVkIHRvIGZldGNoIHtzdWJtaXNzaW9uX3VybH06IHtlfSIpCgogICAgICAgICAgICBpZiB3ZWJfZGF0YSBpcyBOb25lIG9yIGxlbihzdHIod2ViX2RhdGEpLnN0cmlwKCkpID09IDA6CiAgICAgICAgICAgICAgICByYWlzZSBnbC52bS5Vc2VyRXJyb3IoZiJ7RVJST1JfRVhURVJOQUx9IGV2aWRlbmNlIGF0IHtzdWJtaXNzaW9uX3VybH0gaXMgZW1wdHkiKQoKICAgICAgICAgICAgZGlzcHV0ZV9jb250ZXh0ID0gIiIKICAgICAgICAgICAgaWYgaXNfcmVkaXNwdXRlIGFuZCBkaXNwdXRlX3JlYXNvbjoKICAgICAgICAgICAgICAgIGRpc3B1dGVfY29udGV4dCA9IGYiIiIKVGhpcyBzdWJtaXNzaW9uIHdhcyBESVNQVVRFRCBieSBvbmUgb2YgdGhlIHBhcnRpZXMuIFJlLWV4YW1pbmUgdGhlIGV2aWRlbmNlCmNhcmVmdWxseSBpbiBsaWdodCBvZiB0aGUgZGlzcHV0ZSByZWFzb24gYmVsb3csIGFuZCBkbyBub3Qgc2ltcGx5IHJlcGVhdCBhCnByaW9yIHZlcmRpY3QgLSBmb3JtIHlvdXIgb3duIGluZGVwZW5kZW50IGp1ZGdtZW50IGZyb20gdGhlIGN1cnJlbnQgZXZpZGVuY2UuCgpESVNQVVRFIFJFQVNPTjoge2Rpc3B1dGVfcmVhc29ufQoiIiIKCiAgICAgICAgICAgIG5vdGVfY29udGV4dCA9IGYiXG5XT1JLRVInUyBOT1RFOiB7c3VibWlzc2lvbl9ub3RlfVxuIiBpZiBzdWJtaXNzaW9uX25vdGUgZWxzZSAiIgoKICAgICAgICAgICAgcHJvbXB0ID0gZiIiIllvdSBhcmUgYW4gQUkgcmV2aWV3ZXIgdmVyaWZ5aW5nIHRhc2sgY29tcGxldGlvbiBvbiBQcm9vZkdyaWQsIGFuIGVzY3Jvdy1iYWNrZWQgdGFzayBib2FyZC4KClRBU0sgVElUTEU6IHt0aXRsZX0KVEFTSyBERVNDUklQVElPTjoge2Rlc2NyaXB0aW9ufQpDT01QTEVUSU9OIENSSVRFUklBOiB7Y3JpdGVyaWF9CkVYUEVDVEVEIEVWSURFTkNFIEZPUk1BVDoge3N1Ym1pc3Npb25fZm9ybWF0fQoKU1VCTUlUVEVEIEVWSURFTkNFIFVSTDoge3N1Ym1pc3Npb25fdXJsfQp7bm90ZV9jb250ZXh0fXtkaXNwdXRlX2NvbnRleHR9CkVWSURFTkNFIENPTlRFTlQ6CntzdHIod2ViX2RhdGEpWzo4MDAwXX0KCkFuYWx5emUgdGhlIGV2aWRlbmNlIGFnYWluc3QgdGhlIGNvbXBsZXRpb24gY3JpdGVyaWEsIGtlZXBpbmcgaW4gbWluZCB0aGUgZXhwZWN0ZWQKZXZpZGVuY2UgZm9ybWF0IGFib3ZlIChlLmcuIGEgR2l0SHViIHJlcG8sIGEgbGl2ZSBkZXBsb3llZCBhcHAsIGEgdmlkZW8sIGEgZG9jdW1lbnQpLgpEZXRlcm1pbmUgaWYgdGhlIHRhc2sgaGFzIGJlZW4gZ2VudWluZWx5IGNvbXBsZXRlZC4KClJlc3BvbmQgaW4gdmFsaWQgSlNPTiBmb3JtYXQ6Cnt7InZlcmlmaWVkIjogdHJ1ZS9mYWxzZSwgImNvbmZpZGVuY2UiOiAwLTEwMCwgInJlYXNvbmluZyI6ICJkZXRhaWxlZCBleHBsYW5hdGlvbiBvZiB5b3VyIHZlcmlmaWNhdGlvbiJ9fQoKQmUgc3RyaWN0IGJ1dCBmYWlyLiBMb29rIGZvciBldmlkZW5jZSB0aGF0IHRoZSBjcml0ZXJpYSBhcmUgbWV0LiIiIgoKICAgICAgICAgICAgcmVzdWx0ID0gZ2wubm9uZGV0LmV4ZWNfcHJvbXB0KHByb21wdCwgcmVzcG9uc2VfZm9ybWF0PSJqc29uIikKCiAgICAgICAgICAgICMgVGhlIG1vZGVsIG1heSBoYW5kIGJhY2sgYSBKU09OIHN0cmluZyBpbnN0ZWFkIG9mIGFuIG9iamVjdC4KICAgICAgICAgICAgaWYgaXNpbnN0YW5jZShyZXN1bHQsIHN0cik6CiAgICAgICAgICAgICAgICB0cnk6CiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0ganNvbi5sb2FkcyhyZXN1bHQpCiAgICAgICAgICAgICAgICBleGNlcHQgRXhjZXB0aW9uOgogICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IE5vbmUKCiAgICAgICAgICAgICMgU3RyaWN0IHNjaGVtYTogYSB0cnV0aHkgc3RyaW5nIHN1Y2ggYXMgImZhbHNlIiwgYSBtaXNzaW5nL2ludmFsaWQKICAgICAgICAgICAgIyBjb25maWRlbmNlLCBvciBlbXB0eSByZWFzb25pbmcgaXMgbWFsZm9ybWVkIGFuZCBtdXN0IG5ldmVyIHBhc3MuCiAgICAgICAgICAgIHZhbGlkID0gKAogICAgICAgICAgICAgICAgaXNpbnN0YW5jZShyZXN1bHQsIGRpY3QpCiAgICAgICAgICAgICAgICBhbmQgaXNpbnN0YW5jZShyZXN1bHQuZ2V0KCJ2ZXJpZmllZCIpLCBib29sKQogICAgICAgICAgICAgICAgYW5kIGlzaW5zdGFuY2UocmVzdWx0LmdldCgiY29uZmlkZW5jZSIpLCBpbnQpCiAgICAgICAgICAgICAgICBhbmQgbm90IGlzaW5zdGFuY2UocmVzdWx0LmdldCgiY29uZmlkZW5jZSIpLCBib29sKQogICAgICAgICAgICAgICAgYW5kIGlzaW5zdGFuY2UocmVzdWx0LmdldCgicmVhc29uaW5nIiksIHN0cikKICAgICAgICAgICAgICAgIGFuZCBsZW4ocmVzdWx0LmdldCgicmVhc29uaW5nIiwgIiIpLnN0cmlwKCkpID4gMAogICAgICAgICAgICApCiAgICAgICAgICAgIGlmIG5vdCB2YWxpZDoKICAgICAgICAgICAgICAgIHJldHVybiB7CiAgICAgICAgICAgICAgICAgICAgInZlcmlmaWVkIjogRmFsc2UsCiAgICAgICAgICAgICAgICAgICAgImNvbmZpZGVuY2UiOiAwLAogICAgICAgICAgICAgICAgICAgICJyZWFzb25pbmciOiAiQUkgdmVyaWZpY2F0aW9uIHByb2R1Y2VkIG1hbGZvcm1lZCBvdXRwdXQuIE1hbnVhbCByZXZpZXcgbmVlZGVkLiIsCiAgICAgICAgICAgICAgICB9CgogICAgICAgICAgICBjb25maWRlbmNlID0gbWF4KDAsIG1pbigxMDAsIHJlc3VsdFsiY29uZmlkZW5jZSJdKSkKICAgICAgICAgICAgcmV0dXJuIHsKICAgICAgICAgICAgICAgICJ2ZXJpZmllZCI6IHJlc3VsdFsidmVyaWZpZWQiXSwKICAgICAgICAgICAgICAgICJjb25maWRlbmNlIjogY29uZmlkZW5jZSwKICAgICAgICAgICAgICAgICJyZWFzb25pbmciOiByZXN1bHRbInJlYXNvbmluZyJdLnN0cmlwKCksCiAgICAgICAgICAgIH0KCiAgICAgICAgIyBFdmVyeSB2YWxpZGF0b3IgaW5kZXBlbmRlbnRseSByZS1kZXJpdmVzIGEgdmVyZGljdCBmcm9tIGZyZXNobHkKICAgICAgICAjIGZldGNoZWQgZXZpZGVuY2UgYW5kIHRoZXkgbXVzdCBhZ3JlZSB1bmRlciB0aGlzIGVxdWl2YWxlbmNlIHByaW5jaXBsZS4KICAgICAgICBwYXJzZWQgPSBnbC5lcV9wcmluY2lwbGUucHJvbXB0X2NvbXBhcmF0aXZlKAogICAgICAgICAgICBhbmFseXplLAogICAgICAgICAgICBwcmluY2lwbGU9KAogICAgICAgICAgICAgICAgImB2ZXJpZmllZGAgbXVzdCBiZSBleGFjdGx5IHRoZSBzYW1lLiBgY29uZmlkZW5jZWAgc2hvdWxkIGJlIHdpdGhpbiAiCiAgICAgICAgICAgICAgICAiMTUgcG9pbnRzIG9mIGVhY2ggb3RoZXIuIGByZWFzb25pbmdgIG1heSBkaWZmZXIgaW4gd29yZGluZyBidXQgc2hvdWxkICIKICAgICAgICAgICAgICAgICJyZWZlcmVuY2Ugc2ltaWxhciBldmlkZW5jZS4iCiAgICAgICAgICAgICksCiAgICAgICAgKQoKICAgICAgICBzZWxmLnZlcmlmaWNhdGlvbl9yZXN1bHQgPSBqc29uLmR1bXBzKHBhcnNlZCkKICAgICAgICBzZWxmLnN0YXR1cyA9IFNUQVRVU19WRVJJRklFRCBpZiBwYXJzZWQuZ2V0KCJ2ZXJpZmllZCIpIGVsc2UgU1RBVFVTX1JFSkVDVEVECiAgICAgICAgc2VsZi52ZXJpZmllZF9hdCA9IF9jaGFpbl9ub3coKQo="

# Statuses that settle to the creator rather than the worker.
REFUND_STATUSES = ("rejected", "cancelled", "expired")


def _chain_now() -> int:
    """Canonical chain time, in unix seconds - the same source the child uses.

    GenVM injects one transaction-wide datetime, so all validators replaying a
    transaction observe the same value. Every deadline and release guard in
    both contracts reads this, so factory and child can never disagree.
    """
    return int(datetime.now(timezone.utc).timestamp())


@gl.evm.contract_interface
class _Recipient:
    # Ghost-contract interface used only to push a native GEN transfer out of
    # this contract's balance (see release_funds).
    class View:
        pass

    class Write:
        pass


class TaskFactory(gl.Contract):
    # Only activated, reachable children enter the public board registry.
    tasks: DynArray[Address]
    # Pending addresses are separately discoverable so anyone can help activate
    # a child after it materialises; they are never rendered as board tasks.
    pending_tasks: DynArray[Address]
    escrow: TreeMap[Address, u256]
    escrow_released: TreeMap[Address, bool]
    escrow_paid_to: TreeMap[Address, str]
    task_active: TreeMap[Address, bool]
    # Recorded before the asynchronous child deployment, so custody stays
    # attributable even if the child never materialises.
    task_creator: TreeMap[Address, str]
    task_created_at: TreeMap[Address, u256]
    latest_pending_by_creator: TreeMap[Address, Address]
    task_count: u256          # activated tasks visible on the board
    deployment_count: u256    # salt nonce / all deployment attempts

    def __init__(self):
        self.task_count = 0
        self.deployment_count = 0

    @gl.public.write.payable
    def create_task(
        self,
        title: str,
        category: str,
        category_other: str,
        priority: str,
        estimated_effort: str,
        description: str,
        criteria: str,
        submission_format: str,
        submission_format_other: str,
        reward_amount: int,  # whole GEN units; attached value must match in atto-GEN
        deadline: int,       # unix seconds
    ) -> str:
        expected_value = u256(reward_amount) * u256(10 ** 18)
        assert reward_amount > 0, "Reward must be greater than zero"
        assert gl.message.value == expected_value, \
            "Sent value must equal reward_amount GEN (in atto-GEN)"
        now = _chain_now()
        assert deadline > now, \
            f"Deadline must be a future unix timestamp (received {deadline}, chain time is {now})"

        creator = str(gl.message.sender_address)
        factory_address = str(gl.message.contract_address)
        verifier_code = base64.b64decode(TASK_VERIFIER_CODE_B64)
        assert len(verifier_code) > 0, "Task verifier code is not embedded in this factory"

        addr = gl.deploy_contract(
            code=verifier_code,
            args=[
                creator,
                factory_address,
                title,
                category,
                category_other,
                priority,
                estimated_effort,
                description,
                criteria,
                submission_format,
                submission_format_other,
                reward_amount,
                deadline,
            ],
            salt_nonce=int(self.deployment_count) + 1,
            # The deployment is an internal message. With a non-zero salt this
            # call returns its deterministic address, not proof that code is
            # already there. activate_task performs that proof before the task
            # enters the public registry.
            on="accepted",
        )

        assert addr is not None, "Task deployment could not be scheduled - no funds were taken"
        assert addr not in self.escrow, "Task address collision"

        # PENDING CUSTODY: hold the attached GEN and remember who owns it, but do
        # not expose the task on the board until activate_task confirms that the
        # child actually materialised with matching immutable state.
        self.escrow[addr] = gl.message.value
        self.escrow_released[addr] = False
        self.escrow_paid_to[addr] = ""
        self.task_active[addr] = False
        self.task_creator[addr] = creator
        self.task_created_at[addr] = now
        self.latest_pending_by_creator[Address(creator)] = addr
        self.deployment_count += 1
        return str(addr)

    @gl.public.write
    def activate_task(self, task_address: str) -> None:
        """Move a pending child into the board only after it is readable and
        proves it belongs to this factory with the exact creator/reward."""
        addr = Address(task_address)
        assert addr in self.escrow, "Unknown pending task"
        assert not self.escrow_released.get(addr, False), "Escrow already released"
        assert not self.task_active.get(addr, False), "Task already active"

        state = gl.get_contract_at(addr).view().get_task_state()
        this_factory = str(gl.message.contract_address)
        assert str(state["factory"]) == this_factory, "Child is bound to the wrong factory"
        assert str(state["creator"]) == self.task_creator[addr], "Child creator does not match custody record"
        expected = u256(int(state["reward_amount"])) * u256(10 ** 18)
        assert expected == self.escrow[addr], "Child reward does not match escrow"

        self.task_active[addr] = True
        self.tasks.append(addr)
        self.task_count += 1

    @gl.public.write
    def release_funds(self, task_address: str) -> None:
        addr = Address(task_address)
        assert addr in self.escrow, "Unknown task address"
        assert self.task_active.get(addr, False), "Task is pending activation"
        assert not self.escrow_released.get(addr, False), "Escrow already released"

        amount = self.escrow[addr]
        assert amount > 0, "Nothing held for this task"

        # Cross-contract view call into the child: the factory never trusts a
        # cached copy for a payout decision.
        other = gl.get_contract_at(addr)
        state = other.view().get_task_state()

        # Guard against a child that was not produced by this factory. Escrow is
        # keyed by the address we deployed, but we re-check the binding so a
        # mismatched or re-pointed child can never be settled here.
        child_factory = str(state["factory"])
        this_factory = str(gl.message.contract_address)
        assert child_factory == this_factory, (
            f"Task is bound to factory {child_factory}, not {this_factory}"
        )

        # The child owns the lifecycle and canonical-time guards. Reading its
        # settlement view here prevents factory/UI logic from drifting.
        settlement = other.view().get_settlement()
        status = str(settlement["reason"])
        assert status in ("verified",) + REFUND_STATUSES, \
            f"Task is not settleable yet (status: {status})"
        assert bool(settlement["settleable"]), \
            f"Task settlement is not ready until {settlement['ready_at']}"
        recipient = str(settlement["recipient"])
        assert recipient != "", "No payout recipient recorded"

        # Effects before interaction: mark settled, then transfer.
        self.escrow_released[addr] = True
        self.escrow_paid_to[addr] = recipient
        _Recipient(Address(recipient)).emit_transfer(value=amount)

    @gl.public.write
    def reclaim_unresolved(self, task_address: str) -> None:
        """Refund escrow for a task whose child contract never materialised.

        A recorded-but-unreachable child cannot be settled through
        release_funds, because the cross-contract view it depends on always
        fails. This is the escape hatch: after a grace period the creator gets
        their money back. If the child IS reachable this refuses, so it can
        never be used to jump the queue on a live task.
        """
        addr = Address(task_address)
        assert addr in self.escrow, "Unknown task address"
        assert not self.escrow_released.get(addr, False), "Escrow already released"

        creator = self.task_creator.get(addr, "")
        assert creator != "", "No creator recorded for this task"
        assert str(gl.message.sender_address) == creator, "Only the creator can reclaim"

        created_at = int(self.task_created_at.get(addr, u256(0)))
        now = _chain_now()
        assert created_at > 0, "No creation timestamp recorded"
        assert now >= created_at + ORPHAN_GRACE_SECONDS, "Grace period has not elapsed"

        reachable = True
        try:
            gl.get_contract_at(addr).view().get_task_state()
        except Exception:
            reachable = False
        assert not reachable, "Task contract is reachable - settle it with release_funds"

        amount = self.escrow[addr]
        assert amount > 0, "Nothing held for this task"
        self.escrow_released[addr] = True
        self.escrow_paid_to[addr] = creator
        _Recipient(Address(creator)).emit_transfer(value=amount)

    # ── Views ────────────────────────────────────────────────────────────────

    @gl.public.view
    def get_all_tasks(self) -> list[str]:
        return [str(a) for a in self.tasks]

    @gl.public.view
    def get_task_count(self) -> int:
        return int(self.task_count)

    @gl.public.view
    def get_escrow_status(self, task_address: str) -> dict:
        addr = Address(task_address)
        return {
            "locked_amount": self.escrow.get(addr, u256(0)),
            "released": self.escrow_released.get(addr, False),
            "paid_to": self.escrow_paid_to.get(addr, ""),
            "creator": self.task_creator.get(addr, ""),
            "created_at": self.task_created_at.get(addr, u256(0)),
        }

    @gl.public.view
    def get_settlement_status(self, task_address: str) -> dict:
        """Factory's view of whether a task can be settled right now, derived
        from the child's own settlement view. The frontend renders this, so UI,
        factory and child always agree."""
        addr = Address(task_address)
        if addr not in self.escrow:
            return {"known": False, "settleable": False, "recipient": "", "reason": "unknown",
                    "ready_at": 0, "released": False, "locked_amount": 0}

        released = self.escrow_released.get(addr, False)
        if not self.task_active.get(addr, False):
            return {
                "known": True,
                "settleable": False,
                "recipient": self.task_creator.get(addr, ""),
                "reason": "pending",
                "ready_at": int(self.task_created_at.get(addr, u256(0))) + ORPHAN_GRACE_SECONDS,
                "released": released,
                "locked_amount": self.escrow.get(addr, u256(0)),
            }

        other = gl.get_contract_at(addr)
        settlement = other.view().get_settlement()
        return {
            "known": True,
            "settleable": bool(settlement["settleable"]) and not released,
            "recipient": str(settlement["recipient"]),
            "reason": str(settlement["reason"]),
            "ready_at": int(settlement["ready_at"]),
            "released": released,
            "locked_amount": self.escrow.get(addr, u256(0)),
        }

    @gl.public.view
    def get_release_window(self) -> int:
        return RELEASE_WINDOW_SECONDS

    @gl.public.view
    def get_factory_address(self) -> str:
        return str(gl.message.contract_address)
