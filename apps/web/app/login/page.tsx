"use client";

import { useState, type FormEvent } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type LoginResponse = {
  user?: { role: "EMPLOYEE" | "SUPERVISOR" | "ADMIN" };
  error?: { message?: string };
};

export default function LoginPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: form.get("identifier"),
          password: form.get("password")
        })
      });
      const payload = await response.json() as LoginResponse;
      if (!response.ok || !payload.user) {
        setError(payload.error?.message ?? "Login gagal. Periksa kembali data Anda.");
        return;
      }
      window.location.replace(payload.user.role === "ADMIN" ? "/admin" : "/");
    } catch {
      setError(`API belum terhubung di ${API_URL}.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">A</span>
          <strong>ABSENKITA</strong>
        </div>
        <div>
          <p className="login-kicker">SOLUTION X105 TERHUBUNG</p>
          <h1 id="login-title">Masuk untuk mengelola kehadiran.</h1>
          <p>Scan berasal dari mesin. Status hadir, shift, on-call, cuti, lembur, dan off dihitung oleh aplikasi.</p>
        </div>
        <div className="login-facts" aria-label="Fungsi sistem">
          <span>ADMS REAL-TIME</span>
          <span>ROSTER TERPADU</span>
          <span>AKSES BERDASARKAN ROLE</span>
        </div>
      </section>

      <section className="login-form-section">
        <form className="login-form" onSubmit={submit}>
          <div className="login-form-heading">
            <span>AKSES SISTEM</span>
            <h2>Selamat datang</h2>
            <p>Gunakan kode karyawan atau email yang terdaftar.</p>
          </div>

          <label className="form-field">
            <span>Kode karyawan atau email</span>
            <input name="identifier" autoComplete="username" required maxLength={160} />
          </label>

          <label className="form-field">
            <span>Kata sandi</span>
            <input name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={128} />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "MEMERIKSA..." : "MASUK"}
          </button>
        </form>
      </section>
    </main>
  );
}
