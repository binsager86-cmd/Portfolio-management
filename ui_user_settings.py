"""
User Settings — Gemini API Key Management
==========================================
Provides ``ui_api_key_settings(user_id)`` which renders a full
Streamlit page where users can enter, verify, and store their own
Gemini API key (encrypted at rest).

Uses the **new ``google.genai`` Client SDK** and ``models/gemini-2.5-flash``.
"""

import os
import time
from typing import Optional, Tuple

import streamlit as st

from db_layer import get_conn, convert_sql, convert_params, is_postgres


# ── helpers ───────────────────────────────────────────────────────────

def _db_query_one(sql: str, params: tuple):
    """Run a SELECT and return one row (tuple or dict) or None."""
    conn = get_conn()
    try:
        sql = convert_sql(sql)
        params = convert_params(params)
        if is_postgres():
            from psycopg2.extras import RealDictCursor
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(sql, params)
            return cur.fetchone()
        else:
            cur = conn.cursor()
            cur.execute(sql, params)
            return cur.fetchone()
    finally:
        conn.close()


def _db_exec(sql: str, params: tuple):
    """Run an INSERT/UPDATE/DELETE and commit."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(convert_sql(sql), convert_params(params))
        conn.commit()
    finally:
        conn.close()


def _get_user_key_status(user_id: int) -> Tuple[Optional[str], Optional[int], int]:
    """Return (encrypted_key, last_validated_ts, requests_today)."""
    try:
        row = _db_query_one(
            "SELECT gemini_api_key_encrypted, "
            "       gemini_api_key_last_validated, "
            "       gemini_requests_today "
            "FROM users WHERE id = ?",
            (user_id,),
        )
        if row:
            if isinstance(row, dict):
                return row.get('gemini_api_key_encrypted'), row.get('gemini_api_key_last_validated'), row.get('gemini_requests_today') or 0
            return row[0], row[1], row[2] or 0
    except Exception:
        pass
    return None, None, 0


def _save_encrypted_key(user_id: int, encrypted: str) -> None:
    _db_exec(
        "UPDATE users "
        "SET gemini_api_key_encrypted = ?, "
        "    gemini_api_key_last_validated = ? "
        "WHERE id = ?",
        (encrypted, int(time.time()), user_id),
    )


def _remove_key(user_id: int) -> None:
    _db_exec(
        "UPDATE users "
        "SET gemini_api_key_encrypted = NULL, "
        "    gemini_api_key_last_validated = NULL "
        "WHERE id = ?",
        (user_id,),
    )


def _verify_key(api_key: str) -> Tuple[bool, str]:
    """Test the key with a trivial generation call.

    Returns (success: bool, message: str).
    """
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        resp = client.models.generate_content(
            model="models/gemini-2.5-flash",
            contents="You are a validator. Respond with ONLY the word VALID.",
            config=types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=64,
            ),
        )
        text = (resp.text or "").strip().upper()
        if "VALID" in text:
            return True, "Key verified successfully."
        return False, f"Unexpected response: {text!r}"
    except Exception as exc:
        err = str(exc)
        if "401" in err or "UNAUTHENTICATED" in err.upper():
            return False, "Invalid API key. Please check and try again."
        if "403" in err or "PERMISSION" in err.upper():
            return False, (
                "Permission denied. Make sure you use a personal Gmail "
                "(not work/school) and wait 60s after creating the key."
            )
        if "429" in err or "QUOTA" in err.upper():
            return False, (
                "Quota exceeded for this key. Wait a few minutes and retry."
            )
        return False, f"Verification failed: {str(exc)[:200]}"


# ── main page ─────────────────────────────────────────────────────────

def ui_api_key_settings(user_id: int) -> None:
    """Render the API-key management page."""
    st.markdown("## 🔑 Gemini API Key Settings")

    # ── encryption availability ──
    from stock_analysis.utils.encryption import get_encryptor, encrypt_api_key, decrypt_api_key

    encryptor = get_encryptor()
    if encryptor is None:
        st.error(
            "**Encryption not configured.** "
            "Set `MASTER_ENCRYPTION_KEY` in your `.env` file to enable "
            "encrypted key storage.\n\n"
            "Generate one with:\n"
            "```\npython -c \"import secrets; print(secrets.token_urlsafe(32))\"\n```\n"
            "Then add to `.env`:\n"
            "```\nMASTER_ENCRYPTION_KEY=<your key>\n```"
        )
        st.info(
            "Without encryption, keys will be stored in **plaintext** in the "
            "`gemini_api_key` column (legacy mode)."
        )

    encrypted_key, last_validated, requests_today = _get_user_key_status(user_id)
    has_encrypted = bool(encrypted_key)

    # Also check legacy plaintext column
    has_plaintext = False
    try:
        row = _db_query_one(
            "SELECT gemini_api_key FROM users WHERE id = ?", (user_id,)
        )
        if row:
            val = row['gemini_api_key'] if isinstance(row, dict) else row[0]
            if val and not str(val).startswith("your_"):
                has_plaintext = True
    except Exception:
        pass

    # ── status banner ──
    col1, col2 = st.columns(2)
    with col1:
        if has_encrypted:
            st.success("✅ API key configured (encrypted)")
            if last_validated:
                st.caption(
                    f"Last verified: "
                    f"{time.strftime('%Y-%m-%d %H:%M', time.localtime(last_validated))}"
                )
        elif has_plaintext:
            st.warning(
                "⚠️ API key stored in **plaintext** (legacy). "
                "Re-save to encrypt."
            )
        else:
            st.warning("⚠️ No API key configured")

    with col2:
        st.info(
            "**Why provide your own key?**\n"
            "- ✅ Avoid shared quota limits\n"
            "- ✅ Your data stays private\n"
            "- ✅ No cost — free tier is generous\n"
            "- 🔒 Keys stored encrypted at rest"
        )

    # ── quota bar ──
    if has_encrypted or has_plaintext:
        quota_remaining = max(0, 50 - requests_today)
        pct = quota_remaining / 50
        colour = "green" if pct > 0.3 else ("orange" if pct > 0.1 else "red")
        st.markdown(
            f"**Daily quota:** {quota_remaining}/50 remaining "
            f"({'🟢' if colour == 'green' else '🟠' if colour == 'orange' else '🔴'})"
        )
        st.progress(pct)

    st.divider()

    # ── how-to expander ──
    with st.expander(
        "ℹ️ How to get your API key (free)", expanded=not (has_encrypted or has_plaintext)
    ):
        st.markdown(
            "1. Go to **https://aistudio.google.com/app/apikey** (personal Gmail)\n"
            "2. Click **Create API key** → **Create API key in new project**\n"
            "3. Copy the key (starts with `AIzaSy…`)\n"
            "4. Paste below ⬇️\n\n"
            "> 💡 **Free tier:** 60 RPM, ~50-100 RPD for `gemini-2.5-flash` — "
            "more than enough for personal financial analysis."
        )

    # ── key input form ──
    with st.form("api_key_form", clear_on_submit=True):
        api_key = st.text_input(
            "Gemini API Key",
            type="password",
            placeholder="AIzaSy… (≈39 characters)",
            help="Get a free key at https://aistudio.google.com/app/apikey",
        )

        c1, c2, _ = st.columns([2, 2, 6])
        with c1:
            save_btn = st.form_submit_button("✅ Save & Verify", type="primary")
        with c2:
            remove_btn = st.form_submit_button("🗑️ Remove Key")

    # ── handle remove ──
    if remove_btn:
        _remove_key(user_id)
        # Also clear plaintext column
        try:
            _db_exec(
                "UPDATE users SET gemini_api_key = NULL WHERE id = ?", (user_id,)
            )
        except Exception:
            pass
        st.session_state.pop("gemini_api_key", None)
        st.success("🔑 API key removed.")
        time.sleep(1)
        st.rerun()

    # ── handle save ──
    if save_btn:
        if not api_key:
            st.warning("Please enter an API key.")
        elif not api_key.startswith("AIzaSy"):
            st.error("❌ Invalid format — Gemini keys start with `AIzaSy`.")
        elif len(api_key) < 30:
            st.error("❌ Key too short (expected ≈39 characters).")
        else:
            with st.spinner("🔍 Verifying key with models/gemini-2.5-flash…"):
                ok, msg = _verify_key(api_key)

            if ok:
                # Save encrypted (or plaintext if no master key)
                if encryptor:
                    enc = encryptor.encrypt(api_key)
                    _save_encrypted_key(user_id, enc)
                else:
                    # Legacy plaintext fallback
                    try:
                        _db_exec(
                            "UPDATE users SET gemini_api_key = ? WHERE id = ?",
                            (api_key, user_id),
                        )
                    except Exception:
                        pass

                # Also keep in session so rest of app picks it up immediately
                st.session_state["gemini_api_key"] = api_key
                st.success("✅ API key verified and saved securely!")
                time.sleep(1.5)
                st.rerun()
            else:
                st.error(f"❌ {msg}")

    # ── migrate plaintext → encrypted (one-click) ──
    if has_plaintext and encryptor and not has_encrypted:
        st.divider()
        st.markdown("### 🔄 Migrate Plaintext Key to Encrypted Storage")
        if st.button("Encrypt existing key now", key="migrate_key"):
            try:
                row = _db_query_one(
                    "SELECT gemini_api_key FROM users WHERE id = ?", (user_id,)
                )
                if row:
                    val = row['gemini_api_key'] if isinstance(row, dict) else row[0]
                    if val:
                        enc = encryptor.encrypt(val)
                        _save_encrypted_key(user_id, enc)
                        st.success("✅ Key migrated to encrypted storage!")
                        time.sleep(1)
                        st.rerun()
            except Exception as exc:
                st.error(f"Migration failed: {exc}")
