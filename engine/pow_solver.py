"""
MSEMAX — Proof-of-Work (POW) Solver Service

ChatGPT's backend requires clients to solve a SHA3-512 Proof-of-Work
challenge before accepting chat requests. This module handles that:

  1. Receives POW parameters (seed, difficulty, user-agent, dpl)
  2. Brute-forces a nonce that produces a hash below the difficulty target
  3. Returns a base64-encoded proof token prefixed with "gAAAAAB"

The computation is CPU-intensive (SHA3-512 hashing in a loop up to 5M
iterations), so it's offloaded to a ProcessPoolExecutor to avoid blocking
the async event loop. This allows FastAPI to continue handling other
requests while the POW is being solved.

Architecture:
  - _solve_pow_sync(): Runs in a SEPARATE PROCESS (must be picklable)
  - solve_pow_async(): Async wrapper called from the FastAPI request handler
  - get_pool() / shutdown_pool(): Manage the process pool lifecycle

Author: Mohamed (MSEMAX)
License: MIT
"""

import os
import asyncio
import logging
import time
from concurrent.futures import ProcessPoolExecutor
from typing import Optional

logger = logging.getLogger("msemax.pow")


# Process Pool — Module-level, shared across all requests
_pool: Optional[ProcessPoolExecutor] = None


def get_pool() -> ProcessPoolExecutor:
    """
    Lazy-initialize and return the process pool.

    The number of worker processes defaults to the CPU count but can be
    overridden via the MSE_POW_MAX_WORKERS environment variable.
    """
    global _pool
    if _pool is None:
        workers_env = os.environ.get("MSE_POW_MAX_WORKERS")
        if workers_env is None:
            raise RuntimeError("MSE_POW_MAX_WORKERS environment variable is required. Please add it to your .env file.")
        workers = int(workers_env)
        _pool = ProcessPoolExecutor(max_workers=workers)
        logger.info(f"[POW] ProcessPool started with {workers} workers")
    return _pool


def shutdown_pool():
    global _pool
    if _pool:
        _pool.shutdown(wait=False)
        _pool = None
        logger.info("[POW] ProcessPool shutdown")


# =============================================================================
# Synchronous POW Solver — Runs inside a separate PROCESS
# =============================================================================
def _solve_pow_sync(seed: str, difficulty: str, user_agent: str, dpl: str) -> Optional[str]:
    """
    Brute-force solve a SHA3-512 Proof-of-Work challenge.

    IMPORTANT: This function runs in a separate process via ProcessPoolExecutor.
    It MUST be a top-level function (not a closure/lambda) to be picklable.
    All imports are done inside the function to ensure they're available
    in the child process.

    Algorithm:
      1. Construct a proof token array mimicking a real browser's fingerprint
      2. For each nonce (0 to 5,000,000):
         a. Set the nonce in the proof token
         b. JSON-encode and base64-encode the token
         c. Hash (seed + encoded_token) with SHA3-512
         d. If the hash prefix is <= difficulty, return the proof
      3. If no solution found after 5M iterations, return a fallback token

    Args:
        seed: Random seed from the chat-requirements response
        difficulty: Hex string — the hash must be <= this value
        user_agent: Browser user-agent string (part of the fingerprint)
        dpl: Deployment identifier from chat-requirements

    Returns:
        Base64-encoded proof token prefixed with "gAAAAAB", or fallback
    """
    import random
    import hashlib
    import json
    import base64
    from datetime import datetime, timezone

    # Generate a randomized screen resolution (mimics browser fingerprint)
    screen = random.choice([3008, 4010, 6000]) * random.choice([1, 2, 4])

    # Current UTC timestamp in HTTP date format
    now_utc = datetime.now(timezone.utc)
    parse_time = now_utc.strftime('%a, %d %b %Y %H:%M:%S GMT')

    proof_token = [
        screen,
        parse_time,
        None,
        0,
        user_agent,
        "https://tcr9i.chat.openai.com/v2/35536E1E-65B4-4D96-9D97-6ADB7EFF8147/api.js",
        dpl if dpl else "dpl=unknown",
        "en",
        "en-US",
        None,
        "plugins\u2212[object PluginArray]",
        random.choice([
            "_reactListeningcfilawjnerp",
            "_reactListening9ne2dfo1i47",
            "_reactListening410nzwhan2a"
        ]),
        random.choice(["alert", "ontransitionend", "onprogress"])
    ]

    # Brute-force: try up to 5 million nonces
    diff_len = len(difficulty)
    for i in range(5_000_000):
        proof_token[3] = i  # Set current nonce
        json_data = json.dumps(proof_token)
        base = base64.b64encode(json_data.encode()).decode()

        # Hash the seed concatenated with the base64-encoded proof token
        hash_value = hashlib.sha3_512((seed + base).encode()).digest()

        # Check if hash prefix is <= difficulty (lexicographic comparison)
        if hash_value.hex()[:diff_len] <= difficulty:
            return "gAAAAAB" + base

    fallback_base = base64.b64encode(f'"{seed}"'.encode()).decode()
    return "gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D" + fallback_base


# Async Wrapper — Non-blocking interface for FastAPI
async def solve_pow_async(
    seed: str,
    difficulty: str,
    user_agent: str,
    dpl: str
) -> Optional[str]:
    """
    Async wrapper that offloads POW solving to the process pool.

    This is the function called from FastAPI request handlers. It's
    non-blocking: while the POW is being computed in a separate process,
    the event loop is free to handle other requests.

    Args:
        seed: Random seed from chat-requirements
        difficulty: Target difficulty (hex string)
        user_agent: Browser user-agent for fingerprint
        dpl: Deployment identifier

    Returns:
        Proof token string, or None if difficulty is empty
    """
    if not difficulty:
        return None

    logger.info(f"[POW] Solving difficulty={difficulty} in process pool...")
    start = time.time()

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        get_pool(),
        _solve_pow_sync,
        seed, difficulty, user_agent, dpl
    )

    elapsed = time.time() - start
    logger.info(f"[POW] Solved in {elapsed:.2f}s")
    return result
