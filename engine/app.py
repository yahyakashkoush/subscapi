"""
MSEMAX Gateway — FastAPI Server (Main Application)

A high-performance, OpenAI-compatible API gateway that proxies chat completion
requests through ChatGPT's backend API. Provides streaming and non-streaming
responses with automatic metadata sanitization.

Core responsibilities:
  - Accept OpenAI-format requests (POST /v1/chat/completions)
  - Authenticate via Bearer token
  - Enforce rate limits (per-IP) and concurrency limits (global semaphore)
  - Resolve chat-requirements (POW challenges, turnstile tokens)
  - Stream responses back in OpenAI SSE format
  - Strip ChatGPT metadata noise (entity tags, citations, image groups)

Author: Mohamed (MSEMAX)
License: MIT
"""

import os
import re
import json
import uuid
import time
import codecs
import asyncio
import logging
from typing import AsyncGenerator, Optional, Any
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from curl_cffi.requests import AsyncSession
from pydantic import BaseModel
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Import the POW solver module
from pow_solver import solve_pow_async, get_pool, shutdown_pool
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="curl_cffi")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("msemax.api")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def get_env_or_raise(key: str) -> str:
    val = os.environ.get(key)
    if val is None:
        raise RuntimeError(f"{key} environment variable is required. Please add it to your .env file.")
    return val

API_KEY = get_env_or_raise("MSE_MAX_KEY")
IMPERSONATE = get_env_or_raise("MSE_IMPERSONATE")
REQUEST_TIMEOUT = int(get_env_or_raise("MSE_REQUEST_TIMEOUT"))
SESSION_FILE = get_env_or_raise("MSE_SESSION_FILE")
RATE_LIMIT = get_env_or_raise("MSE_RATE_LIMIT")
MAX_CONCURRENT = int(get_env_or_raise("MSE_MAX_CONCURRENT"))

# We cache the parsed session_data.json in memory and only re-read it from disk
_session_cache: Optional[dict] = None
_session_mtime: float = 0.0


# StreamCleaner — Strips ChatGPT metadata noise from responses
class StreamCleaner:

    CITATION_PATTERNS = re.compile(
        r'citeturn\d+(?:[a-z]+\d+)*'
        r'|turn\d+[a-z]+\d+'
        r'|(?<!\w)(?:search|news)\d+'
        r'|(?<!\w)cite(?!\w)'
        r'|【[^】]*?(?:†[^】]*?)?】'
        r'|\[\d+†[^\]]*?\]')
    TAG_KEYWORDS = [
        ("entity", "[", "]"),
        ("image_group", "{", "}"),
        ("products", "{", "}"),
    ]

    HOLD_KEYWORDS = (
        "entity", "image_group", "products",
        "citeturn", "cite", "turn", "search", "news"
    )

    def __init__(self):
        self.buffer = ""

    def feed(self, chunk: str) -> str:
        self.buffer += chunk
        safe, held = self._split_at_partial(self.buffer)
        self.buffer = held
        safe = self._deep_clean(safe)
        safe = self.CITATION_PATTERNS.sub("", safe)
        return safe

    def flush(self) -> str:
        result = self._deep_clean(self.buffer)
        result = self.CITATION_PATTERNS.sub("", result)
        self.buffer = ""

        result = re.sub(r' {2,}', ' ', result)
        result = re.sub(r'\n{3,}', '\n\n', result)
        result = re.sub(r'^\s+$', '', result, flags=re.MULTILINE)
        return result

    @staticmethod
    def _deep_clean(text: str) -> str:
        for keyword, open_ch, close_ch in StreamCleaner.TAG_KEYWORDS:
            search_from = 0
            while True:
                kw_idx = text.find(keyword, search_from)
                if kw_idx == -1:
                    break
                bracket_idx = -1
                scan_end = min(kw_idx + len(keyword) + 5, len(text))
                for i in range(kw_idx + len(keyword), scan_end):
                    if text[i] == open_ch:
                        bracket_idx = i
                        break
                    if text[i] in (' ', '\n', '\t'):
                        break
                if bracket_idx == -1:
                    search_from = kw_idx + len(keyword)
                    continue
                depth = 0
                end_idx = len(text)
                for i in range(bracket_idx, len(text)):
                    if text[i] == open_ch:
                        depth += 1
                    elif text[i] == close_ch:
                        depth -= 1
                        if depth == 0:
                            end_idx = i + 1
                            break
                start_idx = kw_idx
                while start_idx > 0 and text[start_idx - 1] not in (
                    ' ', '\n', '\t', '\r', ':', '.', '،', '؛', '!', '?', '('
                ):
                    start_idx -= 1
                text = text[:start_idx] + text[end_idx:]
                search_from = start_idx
        search_from = 0
        while True:
            idx = text.find('["', search_from)
            if idx == -1:
                break
            bracket_end = -1
            depth = 0
            for i in range(idx, len(text)):
                if text[i] == '[':
                    depth += 1
                elif text[i] == ']':
                    depth -= 1
                    if depth == 0:
                        bracket_end = i + 1
                        break
            if bracket_end == -1:
                break
            content = text[idx + 1:bracket_end - 1]
            if '","' in content and content.startswith('"') and content.endswith('"'):
                start = idx
                while start > 0 and text[start - 1] not in (
                    ' ', '\n', '\t', '\r', ':', '.', '،', '؛', '!', '?', '('
                ):
                    start -= 1
                text = text[:start] + text[bracket_end:]
                search_from = start
            else:
                search_from = bracket_end
        return text

    def _split_at_partial(self, text: str) -> tuple[str, str]:
        if not text:
            return ("", "")
        for keyword, open_ch, close_ch in self.TAG_KEYWORDS:
            idx = text.rfind(keyword)
            if idx >= 0:
                bracket_start = idx + len(keyword)
                if bracket_start >= len(text):
                    return (text[:idx], text[idx:])
                scan_end = min(bracket_start + 5, len(text))
                for i in range(bracket_start, scan_end):
                    if text[i] == open_ch:
                        depth = 0
                        closed = False
                        for j in range(i, len(text)):
                            if text[j] == open_ch:
                                depth += 1
                            elif text[j] == close_ch:
                                depth -= 1
                                if depth == 0:
                                    closed = True
                                    break
                        if not closed:
                            hold_start = idx
                            while hold_start > 0 and text[hold_start - 1] not in (' ', '\n', '\t', '\r'):
                                hold_start -= 1
                            return (text[:hold_start], text[hold_start:])
                        break
                    if text[i] in (' ', '\n', '\t'):
                        break
        check_start = max(0, len(text) - 30)
        for i in range(check_start, len(text)):
            suffix = text[i:]
            for kw in self.HOLD_KEYWORDS:
                if len(suffix) < len(kw) and kw.startswith(suffix):
                    return (text[:i], text[i:])
        return (text, "")


# Rate Limiting — Per-IP request throttling via slowapi
limiter = Limiter(key_func=get_remote_address)

_semaphore: Optional[asyncio.Semaphore] = None


def _get_semaphore() -> asyncio.Semaphore:
    """Lazy-initialize the concurrency semaphore on first access."""
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(MAX_CONCURRENT)
        logger.info(f"Concurrency semaphore initialized: max {MAX_CONCURRENT} simultaneous requests")
    return _semaphore


def _get_available_slots(sem: asyncio.Semaphore) -> int:
    try:
        return sem._value
    except AttributeError:
        return -1



# Application Lifecycle — Startup and shutdown hooks
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up MSEMAX FastAPI server...")
    logger.info(f"Rate limit: {RATE_LIMIT} | Max concurrent: {MAX_CONCURRENT}")
    get_pool()
    _get_semaphore() 
    yield

    logger.info("Shutting down...")
    shutdown_pool()



# FastAPI App Initialization
app = FastAPI(title="MSEMAX Gateway", version="1.0.0", lifespan=lifespan)
# Register the rate limit exceeded handler so slowapi returns proper 429 errors
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# Enable CORS for all origins (suitable for development and API gateway usage)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
async def verify_api_key(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer ") or auth_header[7:] != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

def get_session_data() -> dict:
    global _session_cache, _session_mtime
    if not os.path.exists(SESSION_FILE):
        raise HTTPException(
            status_code=500,
            detail="session_data.json not found. Please run get_session.py first."
        )
    try:
        current_mtime = os.path.getmtime(SESSION_FILE)

        if _session_cache is not None and current_mtime == _session_mtime:
            return _session_cache

        with open(SESSION_FILE, "r") as f:
            _session_cache = json.load(f)
        _session_mtime = current_mtime
        logger.info("Session data reloaded from disk (file changed)")
        return _session_cache
    except Exception as e:
        logger.error(f"Failed to read {SESSION_FILE}: {e}")
        raise HTTPException(status_code=500, detail="Failed to read session data.")


# Header Preparation — Build the request headers for upstream API calls
def _prepare_headers(session_data: dict) -> dict:
    headers = dict(session_data.get("headers", {}))
    # Inject the captured access token
    access_token = session_data.get("access_token", "")
    if access_token:
        headers["authorization"] = f"Bearer {access_token}"
    # Remove headers that curl_cffi or the upstream server will set itself,
    # or that would cause conflicts (e.g., wrong content-length)
    for h in ["content-length", "accept-encoding", "host", "connection", "cookie"]:
        headers.pop(h, None)
    # Remove OpenAI-specific routing headers (they're for internal use)
    for h in ["x-openai-target-path", "x-openai-target-route"]:
        headers.pop(h, None)
    # Set user-agent — prefer the one from the captured session for consistency
    ua = (
        session_data.get("user_agent")
        or headers.get("user-agent")
        or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    headers["user-agent"] = ua
    # Set Client Hints headers to match Chrome 120 browser fingerprint
    headers["sec-ch-ua"] = '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"'
    headers["sec-ch-ua-mobile"] = "?0"
    headers["sec-ch-ua-platform"] = '"Windows"'

    return headers


async def _get_chat_requirements(headers: dict, cookies: dict) -> Optional[dict]:
    try:
        async with AsyncSession() as session:
            response = await session.post(
                "https://chatgpt.com/backend-api/sentinel/chat-requirements",
                headers=headers,
                cookies=cookies,
                json={"p": ""},
                impersonate=IMPERSONATE,
                timeout=15
            )

        if response.status_code != 200:
            logger.error(f"chat-requirements failed: {response.status_code} - {response.text}")
            return None

        data = response.json()
        logger.info(
            f"Requirements: POW={data.get('proofofwork', {}).get('required')}, "
            f"Turnstile={data.get('turnstile', {}).get('required')}"
        )
        return data
    except Exception as e:
        logger.error(f"chat-requirements error: {e}")
        return None


async def _prepare_sentinel_headers(session_data: dict, headers: dict) -> dict:
    requirements = await _get_chat_requirements(headers, session_data.get("cookies", {}))
    if not requirements:
        raise Exception("Failed to get chat-requirements (session might be expired)")

    headers["openai-sentinel-chat-requirements-token"] = requirements.get("token", "")

    # Solve Proof-of-Work challenge if required
    pow_data = requirements.get("proofofwork", {})
    if pow_data.get("required", False):
        proof = await solve_pow_async(
            seed=pow_data.get("seed", ""),
            difficulty=pow_data.get("difficulty", ""),
            user_agent=headers.get("user-agent", ""),
            dpl=pow_data.get("dpl", "")
        )
        if proof:
            headers["openai-sentinel-proof-token"] = proof

    turnstile = session_data.get("turnstile_token")
    if turnstile:
        headers["openai-sentinel-turnstile-token"] = turnstile

    return headers


# OpenAI-Format Response Builders

def _make_chunk(chunk_id: str, model: str, delta: dict, finish_reason: str = None) -> str:


    return "data: " + json.dumps({
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}]
    }, ensure_ascii=False) + "\n\n"



# Request/Response Models — Pydantic schemas for API validation

class ChatMessage(BaseModel):
    role: str
    content: Any = None
    model_config = {"extra": "ignore"}


class ChatRequest(BaseModel):
    model: str = "auto"
    messages: list[ChatMessage]
    stream: bool = False

    model_config = {"extra": "ignore"}


def _extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    elif isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text", "")))
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts)
    return str(content) if content is not None else ""


# Payload Builder — Converts OpenAI-format messages to ChatGPT backend format
def _build_payload(messages: list[ChatMessage], model: str) -> dict:
    chatgpt_messages = []
    system_parts = [_extract_text(m.content) for m in messages if m.role == "system"]
    system_prompt = "\n\n".join(p for p in system_parts if p.strip())
    if system_prompt:
        chatgpt_messages.append({
            "id": str(uuid.uuid4()),
            "author": {"role": "system"},
            "content": {"content_type": "text", "parts": [system_prompt]},
            "metadata": {"is_user_system_message": True}
        })

    history_lines = []
    for msg in messages:
        if msg.role == "system":
            continue
        content_text = _extract_text(msg.content).strip()
        if not content_text:
            continue
        if msg.role == "user":
            history_lines.append(f"User: {content_text}")
        elif msg.role == "assistant":
            history_lines.append(f"Assistant: {content_text}")
        elif msg.role == "tool":
            history_lines.append(f"Tool Result: {content_text}")

    flattened_prompt = "\n".join(history_lines).strip() or "Hello"

    chatgpt_messages.append({
        "id": str(uuid.uuid4()),
        "author": {"role": "user"},
        "content": {"content_type": "text", "parts": [flattened_prompt]},
        "metadata": {}
    })

    upstream_model = model if model in ("auto", "gpt-4o", "gpt-4o-mini", "chatgpt-4o-latest") else "auto"

    return {
        "action": "next",
        "messages": chatgpt_messages,
        "parent_message_id": str(uuid.uuid4()),
        "model": upstream_model,
        "timezone_offset_min": -120,
        "history_and_training_disabled": False,
        "conversation_mode": {"kind": "primary_assistant"}
    }


async def chat_stream_generator(request_data: ChatRequest, session_data: dict) -> AsyncGenerator[str, None]:

    headers = _prepare_headers(session_data)

    try:
        headers = await _prepare_sentinel_headers(session_data, headers)
    except Exception as e:
        yield _make_chunk("error", request_data.model, {"content": f"\n\n[Error: {str(e)}]"})
        yield "data: [DONE]\n\n"
        return

    chunk_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    model = request_data.model
    prev_text = ""
    sent_role = False
    cleaner = StreamCleaner()

    _tool_call_markers = ("attempt_completion", "read_file", "write_to_file", "execute_command")
    system_text = " ".join(
        _extract_text(m.content) for m in request_data.messages if m.role == "system"
    ).lower()
    requires_tool_completion = any(marker in system_text for marker in _tool_call_markers)

    payload = _build_payload(request_data.messages, model)
    cookies = session_data.get("cookies", {})

    async with AsyncSession() as session:
        try:
            response = await session.post(
                "https://chatgpt.com/backend-api/conversation",
                json=payload,
                headers=headers,
                cookies=cookies,
                impersonate=IMPERSONATE,
                timeout=REQUEST_TIMEOUT,
                stream=True,
            )
            if response.status_code != 200:
                error_msg = f"ChatGPT returned {response.status_code}"
                if response.status_code == 403:
                    error_msg += " (Session Expired)"
                elif response.status_code == 429:
                    error_msg += " (Rate Limited)"

                yield _make_chunk(chunk_id, model, {"content": f"\n\n[{error_msg}]"})
                yield "data: [DONE]\n\n"
                return

            decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
            buffer = ""

            async for raw_bytes in response.aiter_content():
                text = decoder.decode(raw_bytes) if isinstance(raw_bytes, bytes) else raw_bytes
                buffer += text

                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue

                    raw = line[6:]

                    if raw == "[DONE]":
                        remaining = cleaner.flush()
                        if remaining:
                            yield _make_chunk(chunk_id, model, {"content": remaining})

                        if requires_tool_completion:
                            full_text = prev_text
                            if "<attempt_completion>" not in full_text and "<tool_call>" not in full_text:
                                completion_tag = (
                                    '\n<attempt_completion>\n'
                                    '<result>\nTask completed.\n</result>\n'
                                    '</attempt_completion>\n'
                                )
                                yield _make_chunk(chunk_id, model, {"content": completion_tag})

                        yield _make_chunk(chunk_id, model, {}, finish_reason="stop")
                        yield "data: [DONE]\n\n"
                        return

                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    if data.get("type") == "server_sent_metadata":
                        model = data.get("metadata", {}).get("model_slug", model)
                        continue

                    msg = data.get("message")
                    if not msg or msg.get("author", {}).get("role") != "assistant":
                        continue

                    parts = msg.get("content", {}).get("parts", [])
                    if not parts or not isinstance(parts[0], str):
                        continue

                    current_text = parts[0]

                    if not sent_role:
                        yield _make_chunk(chunk_id, model, {"role": "assistant", "content": ""})
                        sent_role = True

                    if len(current_text) > len(prev_text):
                        new_content = current_text[len(prev_text):]
                        cleaned = cleaner.feed(new_content)
                        if cleaned:
                            yield _make_chunk(chunk_id, model, {"content": cleaned})
                        prev_text = current_text

        except asyncio.TimeoutError:
            logger.error("Stream read timed out")
            remaining = cleaner.flush()
            if remaining:
                yield _make_chunk(chunk_id, model, {"content": remaining})
            yield _make_chunk(chunk_id, model, {"content": "\n\n[Stream Timeout]"})
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            remaining = cleaner.flush()
            if remaining:
                yield _make_chunk(chunk_id, model, {"content": remaining})
            yield _make_chunk(chunk_id, model, {"content": f"\n\n[Connection Error: {str(e)}]"})
            yield "data: [DONE]\n\n"


# API Endpoints
@app.post("/v1/chat/completions", dependencies=[Depends(verify_api_key)])
@limiter.limit(RATE_LIMIT)
async def chat_completions(request: Request, chat_request: ChatRequest):
    session_data = get_session_data()
    sem = _get_semaphore()
    try:
        await asyncio.wait_for(sem.acquire(), timeout=35.0)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Server request queue timeout — high traffic, please retry shortly.",
                "type": "concurrency_limit"
            }
        )

    try:
        if chat_request.stream:
            async def _tracked_chat_stream():
                try:
                    async for chunk in chat_stream_generator(chat_request, session_data):
                        yield chunk
                finally:
                    sem.release()

            return StreamingResponse(
                _tracked_chat_stream(),
                media_type="text/event-stream"
            )
        else:
            try:
                full_content = ""
                model_slug = chat_request.model

                async for chunk_str in chat_stream_generator(chat_request, session_data):
                    if chunk_str.startswith("data: ") and chunk_str != "data: [DONE]\n\n":
                        try:
                            chunk = json.loads(chunk_str[6:].strip())
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            full_content += delta.get("content", "")
                            m = chunk.get("model", "")
                            if m and m != "auto":
                                model_slug = m
                        except Exception:
                            pass

                final_cleaner = StreamCleaner()
                full_content = final_cleaner.feed(full_content) + final_cleaner.flush()
                full_content = StreamCleaner._deep_clean(full_content)

                return JSONResponse({
                    "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": model_slug,
                    "choices": [{
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": full_content
                        },
                        "finish_reason": "stop"
                    }]
                })
            finally:
                sem.release()
    except Exception:
        sem.release()
        raise


# =============================================================================
# OpenAI Responses API Handler (for Codex CLI / Desktop v0.137+ and newer SDKs)
# =============================================================================

def _parse_responses_payload(body: dict) -> tuple[ChatRequest, bool]:
    model = body.get("model", "auto")
    stream = body.get("stream", True)
    messages: list[ChatMessage] = []

    # 1. System instructions
    instructions = body.get("instructions")
    if instructions and isinstance(instructions, str):
        messages.append(ChatMessage(role="system", content=instructions))

    # 2. Input array or string
    inp = body.get("input")
    if isinstance(inp, str):
        messages.append(ChatMessage(role="user", content=inp))
    elif isinstance(inp, list):
        for item in inp:
            if isinstance(item, str):
                messages.append(ChatMessage(role="user", content=item))
            elif isinstance(item, dict):
                role = item.get("role", "user")
                if item.get("type") == "message":
                    role = item.get("role", "user")

                content = item.get("content", "")
                if isinstance(content, list):
                    text_parts = []
                    for part in content:
                        if isinstance(part, str):
                            text_parts.append(part)
                        elif isinstance(part, dict):
                            if part.get("type") in ("text", "input_text", "output_text"):
                                text_parts.append(str(part.get("text", "")))
                    content = "\n".join(text_parts)
                messages.append(ChatMessage(role=role, content=content))
    elif body.get("messages") and isinstance(body.get("messages"), list):
        for m in body["messages"]:
            messages.append(ChatMessage(role=m.get("role", "user"), content=m.get("content", "")))

    if not messages:
        messages.append(ChatMessage(role="user", content="Hello"))

    return ChatRequest(model=model, messages=messages, stream=stream), stream


async def responses_stream_generator(chat_request: ChatRequest, session_data: dict) -> AsyncGenerator[str, None]:
    resp_id = f"resp_{uuid.uuid4().hex[:24]}"
    item_id = f"item_{uuid.uuid4().hex[:24]}"
    model = chat_request.model or "auto"

    # 1. response.created
    created_event = {
        "type": "response.created",
        "response": {
            "id": resp_id,
            "object": "response",
            "status": "in_progress",
            "model": model,
            "output": []
        }
    }
    yield f"event: response.created\ndata: {json.dumps(created_event, ensure_ascii=False)}\n\n"

    # 2. response.output_item.added
    output_item_added = {
        "type": "response.output_item.added",
        "output_index": 0,
        "item": {
            "id": item_id,
            "type": "message",
            "status": "in_progress",
            "role": "assistant",
            "content": []
        }
    }
    yield f"event: response.output_item.added\ndata: {json.dumps(output_item_added, ensure_ascii=False)}\n\n"

    # 3. response.content_part.added
    part_added = {
        "type": "response.content_part.added",
        "output_index": 0,
        "content_index": 0,
        "part": {
            "type": "output_text",
            "text": ""
        }
    }
    yield f"event: response.content_part.added\ndata: {json.dumps(part_added, ensure_ascii=False)}\n\n"

    full_text = ""
    async for chunk_str in chat_stream_generator(chat_request, session_data):
        if chunk_str.startswith("data: ") and chunk_str.strip() != "data: [DONE]":
            try:
                chunk_json = json.loads(chunk_str[6:].strip())
                choices = chunk_json.get("choices", [])
                if choices:
                    delta = choices[0].get("delta", {})
                    content_piece = delta.get("content", "")
                    if content_piece:
                        full_text += content_piece
                        delta_event = {
                            "type": "response.text.delta",
                            "output_index": 0,
                            "content_index": 0,
                            "delta": content_piece
                        }
                        delta_event_out = {
                            "type": "response.output_text.delta",
                            "output_index": 0,
                            "content_index": 0,
                            "delta": content_piece
                        }
                        yield f"event: response.text.delta\ndata: {json.dumps(delta_event, ensure_ascii=False)}\n\n"
                        yield f"event: response.output_text.delta\ndata: {json.dumps(delta_event_out, ensure_ascii=False)}\n\n"
            except Exception:
                pass

    # 4. response.text.done
    text_done = {
        "type": "response.text.done",
        "output_index": 0,
        "content_index": 0,
        "text": full_text
    }
    yield f"event: response.text.done\ndata: {json.dumps(text_done, ensure_ascii=False)}\n\n"

    part_done = {
        "type": "response.content_part.done",
        "output_index": 0,
        "content_index": 0,
        "part": {
            "type": "output_text",
            "text": full_text
        }
    }
    yield f"event: response.content_part.done\ndata: {json.dumps(part_done, ensure_ascii=False)}\n\n"

    # 5. response.output_item.done
    item_done = {
        "type": "response.output_item.done",
        "output_index": 0,
        "item": {
            "id": item_id,
            "type": "message",
            "status": "completed",
            "role": "assistant",
            "content": [{"type": "output_text", "text": full_text}]
        }
    }
    yield f"event: response.output_item.done\ndata: {json.dumps(item_done, ensure_ascii=False)}\n\n"

    # 6. response.completed
    resp_completed = {
        "type": "response.completed",
        "response": {
            "id": resp_id,
            "object": "response",
            "status": "completed",
            "model": model,
            "output": [
                {
                    "id": item_id,
                    "type": "message",
                    "status": "completed",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": full_text}]
                }
            ]
        }
    }
    yield f"event: response.completed\ndata: {json.dumps(resp_completed, ensure_ascii=False)}\n\n"
    yield f"event: response.done\ndata: {json.dumps(resp_completed, ensure_ascii=False)}\n\n"


@app.post("/v1/responses", dependencies=[Depends(verify_api_key)])
@app.post("/responses", dependencies=[Depends(verify_api_key)])
@limiter.limit(RATE_LIMIT)
async def responses_endpoint(request: Request):
    body = await request.json()
    chat_request, is_stream = _parse_responses_payload(body)

    session_data = get_session_data()
    sem = _get_semaphore()
    try:
        await asyncio.wait_for(sem.acquire(), timeout=35.0)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Server request queue timeout — high traffic, please retry shortly.",
                "type": "concurrency_limit"
            }
        )

    try:
        if is_stream:
            async def _tracked_responses_stream():
                try:
                    async for chunk in responses_stream_generator(chat_request, session_data):
                        yield chunk
                finally:
                    sem.release()

            return StreamingResponse(
                _tracked_responses_stream(),
                media_type="text/event-stream"
            )
        else:
            try:
                full_text = ""
                async for chunk_str in chat_stream_generator(chat_request, session_data):
                    if chunk_str.startswith("data: ") and chunk_str.strip() != "data: [DONE]":
                        try:
                            chunk_json = json.loads(chunk_str[6:].strip())
                            choices = chunk_json.get("choices", [])
                            if choices:
                                piece = choices[0].get("delta", {}).get("content", "")
                                if piece:
                                    full_text += piece
                        except Exception:
                            pass

                resp_id = f"resp_{uuid.uuid4().hex[:24]}"
                item_id = f"item_{uuid.uuid4().hex[:24]}"
                return JSONResponse({
                    "id": resp_id,
                    "object": "response",
                    "status": "completed",
                    "model": chat_request.model,
                    "output": [
                        {
                            "id": item_id,
                            "type": "message",
                            "status": "completed",
                            "role": "assistant",
                            "content": [{"type": "output_text", "text": full_text}]
                        }
                    ]
                })
            finally:
                sem.release()
    except Exception:
        sem.release()
        raise


@app.get("/")
@app.get("/health")
async def health_check():
    has_session = os.path.exists(SESSION_FILE)
    sem = _get_semaphore()
    return {
        "status": "ok",
        "version": "MSEMAX 1.0",
        "session_file_loaded": has_session,
        "concurrent_slots_available": _get_available_slots(sem),
        "max_concurrent": MAX_CONCURRENT,
        "rate_limit": RATE_LIMIT
    }


@app.get("/v1/models", dependencies=[Depends(verify_api_key)])
async def list_models():
    models = ["auto", "gpt-4o", "gpt-4o-mini", "chatgpt-4o-latest", "gpt-4", "gpt-3.5-turbo", "msemax", "gpt-6.1-sol", "astra"]
    return {
        "object": "list",
        "data": [
            {
                "id": m,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "msemax"
            }
            for m in models
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
