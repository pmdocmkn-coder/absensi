"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import readXlsxFile from "read-excel-file/browser";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type ImportRow = {
  employeeCode: string;
  name: string;
  deviceUserCode: string;
  deviceSerial: string;
  departmentCode: string;
  departmentName: string;
  rosterGroup: string;
  email: string;
  role: "" | "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
};

type PreparedRow = ImportRow & { rowNumber: number; errors: string[] };
type ImportReport = { total: number; created: number; updated: number; departmentsCreated: number; mappingsAdded: number; rosterConfigured: number };

const headerAliases: Record<keyof ImportRow, string[]> = {
  employeeCode: ["kode_karyawan", "kode karyawan", "employee_code", "nip", "id_karyawan"],
  name: ["nama", "nama_karyawan", "nama karyawan", "name"],
  deviceUserCode: ["pin_x105", "pin x105", "pin", "device_user_code"],
  deviceSerial: ["serial_x105", "serial x105", "serial", "device_serial"],
  departmentCode: ["kode_departemen", "kode departemen", "department_code", "departemen_kode"],
  departmentName: ["nama_departemen", "nama departemen", "department", "departemen"],
  rosterGroup: ["kelompok_roster", "kelompok roster", "crew", "kelompok"],
  email: ["email", "surel"],
  role: ["akses", "role", "hak_akses"]
};

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseCsv(text: string) {
  const separator = (text.split(/\r?\n/, 1)[0]?.match(/;/g)?.length ?? 0) > (text.split(/\r?\n/, 1)[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === separator && !quoted) {
      row.push(value.trim()); value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; value = "";
    } else value += character;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function prepareRows(matrix: unknown[][], defaultSerial: string): PreparedRow[] {
  const headers = (matrix[0] ?? []).map(normalizeHeader);
  const column = (key: keyof ImportRow) => headers.findIndex((header) => headerAliases[key].includes(header));
  const indexes = Object.fromEntries((Object.keys(headerAliases) as Array<keyof ImportRow>).map((key) => [key, column(key)])) as Record<keyof ImportRow, number>;
  if (indexes.employeeCode < 0 || indexes.name < 0) throw new Error("Kolom kode_karyawan dan nama wajib ada pada baris pertama.");

  return matrix.slice(1).filter((source) => source.some((cell) => cellText(cell))).map((source, index) => {
    const get = (key: keyof ImportRow) => indexes[key] < 0 ? "" : cellText(source[indexes[key]]);
    const roleText = get("role").toUpperCase();
    const row: ImportRow = {
      employeeCode: get("employeeCode"), name: get("name"), deviceUserCode: get("deviceUserCode"),
      deviceSerial: get("deviceSerial") || defaultSerial.trim(), departmentCode: get("departmentCode").toUpperCase(),
      departmentName: get("departmentName"), rosterGroup: get("rosterGroup"), email: get("email").toLowerCase(),
      role: roleText === "ADMIN" || roleText === "SUPERVISOR" || roleText === "EMPLOYEE" ? roleText : ""
    };
    const errors: string[] = [];
    if (!row.employeeCode) errors.push("kode kosong");
    if (!row.name) errors.push("nama kosong");
    if (row.deviceUserCode && !row.deviceSerial) errors.push("serial X105 kosong");
    if (row.deviceSerial && !row.deviceUserCode) errors.push("PIN X105 kosong");
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("email tidak valid");
    if (roleText && !["EMPLOYEE", "SUPERVISOR", "ADMIN"].includes(roleText)) errors.push("akses harus EMPLOYEE, SUPERVISOR, atau ADMIN");
    return { ...row, rowNumber: index + 2, errors };
  });
}

export function EmployeeImport({ defaultDeviceSerial, onImported }: { defaultDeviceSerial?: string; onImported: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [defaultSerial, setDefaultSerial] = useState(defaultDeviceSerial ?? "");
  const [matrix, setMatrix] = useState<unknown[][]>([]);
  const [parseError, setParseError] = useState("");
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const rows = useMemo(() => {
    if (!matrix.length) return [];
    try { return prepareRows(matrix, defaultSerial); }
    catch (reason) { return [{ rowNumber: 1, errors: [reason instanceof Error ? reason.message : "Format file tidak valid"] } as PreparedRow]; }
  }, [matrix, defaultSerial]);
  const errors = rows.flatMap((row) => row.errors.map((message) => `Baris ${row.rowNumber}: ${message}`));

  useEffect(() => {
    if (!defaultSerial && defaultDeviceSerial) setDefaultSerial(defaultDeviceSerial);
  }, [defaultDeviceSerial, defaultSerial]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        setOpen(false); setFileName(""); setMatrix([]); setParseError(""); setReport(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); };
  }, [open, saving]);

  const close = () => { if (!saving) { setOpen(false); setFileName(""); setMatrix([]); setParseError(""); setReport(null); } };
  const chooseFile = async (file?: File) => {
    if (!file) return;
    setParseError(""); setReport(null); setFileName(file.name);
    try {
      const parsed = (file.name.toLowerCase().endsWith(".xlsx")
        ? await readXlsxFile(file)
        : parseCsv((await file.text()).replace(/^\uFEFF/, ""))) as unknown[][];
      if (parsed.length < 2) throw new Error("File belum berisi data karyawan.");
      setMatrix(parsed);
    } catch (reason) {
      setMatrix([]);
      setParseError(reason instanceof Error ? reason.message : "File tidak dapat dibaca");
    }
  };
  const downloadTemplate = () => {
    const content = `kode_karyawan,nama,pin_x105,serial_x105,kode_departemen,nama_departemen,kelompok_roster,email,akses\r\nEMP001,Contoh Crew A,119,${defaultSerial || "SERIAL-X105"},PIT,Pit Crew,Crew A,,EMPLOYEE\r\nEMP002,Contoh Telco,120,${defaultSerial || "SERIAL-X105"},TELCO,Telco,,,EMPLOYEE\r\n`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
    link.download = "template-data-karyawan.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const submit = async () => {
    if (!rows.length || errors.length) return;
    setSaving(true); setParseError("");
    try {
      const response = await fetch(`${API_URL}/api/employees/import-setup`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ records: rows.map(({ errors: _errors, rowNumber: _rowNumber, ...row }) => ({
          employeeCode: row.employeeCode, name: row.name, ...(row.email ? { email: row.email } : {}), ...(row.role ? { role: row.role } : {}),
          departmentCode: row.departmentCode || null, departmentName: row.departmentName || null,
          deviceSerial: row.deviceSerial || null, deviceUserCode: row.deviceUserCode || null, rosterGroup: row.rosterGroup || null
        })) })
      });
      const payload = await response.json() as ImportReport & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Impor data karyawan gagal");
      setReport(payload);
      await onImported();
    } catch (reason) { setParseError(reason instanceof Error ? reason.message : "Impor data karyawan gagal"); }
    finally { setSaving(false); }
  };

  return <>
    <button className="secondary-button" type="button" onClick={() => setOpen(true)}>IMPOR DATA</button>
    {open ? <div className="import-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="employee-import-title">
        <div className="import-modal-header"><div><span className="eyebrow">IMPOR MASSAL</span><h2 id="employee-import-title">Lengkapi data karyawan</h2><p>Unggah CSV atau Excel. Sistem mencocokkan data lama dari PIN X105 agar tidak membuat karyawan ganda.</p></div><button className="icon-button" type="button" onClick={close} aria-label="Tutup">×</button></div>
        <div className="import-modal-body">
          <div className="import-guide"><strong>Kolom wajib: kode_karyawan dan nama</strong><span>Isi kelompok_roster untuk karyawan shift, misalnya Crew A, Crew B, Crew C, atau Drill. Untuk departemen selain PIT Crew, kelompok roster boleh kosong dan sistem memakai Steady Day.</span></div>
          <div className="import-controls">
            <label className="form-field"><span>Serial X105 default</span><input value={defaultSerial} onChange={(event) => setDefaultSerial(event.target.value)} placeholder="Dipakai jika kolom serial kosong" /></label>
            <div className="import-file-actions"><button className="secondary-button" type="button" onClick={downloadTemplate}>UNDUH TEMPLATE</button><button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>PILIH FILE</button><input ref={inputRef} hidden type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { void chooseFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></div>
          </div>
          {fileName ? <div className="import-file-summary"><div><strong>{fileName}</strong><span>{Math.max(rows.length, 0)} baris terbaca</span></div><button className="text-button" type="button" onClick={() => inputRef.current?.click()}>Ganti file</button></div> : <div className="import-empty"><strong>Belum ada file dipilih</strong><span>Gunakan template agar susunan kolom langsung sesuai.</span></div>}
          {parseError ? <div className="notice notice-error"><strong>Impor belum dapat dilanjutkan</strong><span>{parseError}</span></div> : null}
          {errors.length ? <div className="import-errors"><strong>{errors.length} masalah perlu diperbaiki</strong>{errors.slice(0, 5).map((message) => <span key={message}>{message}</span>)}</div> : null}
          {report ? <div className="notice notice-success"><strong>{report.total} karyawan berhasil diproses</strong><span>{report.created} baru, {report.updated} diperbarui, {report.mappingsAdded} mapping ditambahkan, {report.rosterConfigured} pola roster diatur</span></div> : null}
          {rows.length && !errors.length ? <div className="import-preview-wrap"><table className="import-preview"><thead><tr><th>Baris</th><th>Karyawan</th><th>PIN X105</th><th>Departemen</th><th>Pola kerja</th></tr></thead><tbody>{rows.slice(0, 8).map((row) => {
            const departmentText = `${row.departmentCode} ${row.departmentName}`.toLowerCase();
            const inferredMode = row.rosterGroup || (departmentText.trim() && !departmentText.includes("pit") ? "Steady Day otomatis" : "Belum dijadwalkan");
            return <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><strong>{row.name}</strong><small>{row.employeeCode}</small></td><td>{row.deviceUserCode || "Tidak ada"}<small>{row.deviceSerial || "Tanpa mapping"}</small></td><td>{row.departmentName || row.departmentCode || "Belum diisi"}</td><td>{inferredMode}</td></tr>;
          })}</tbody></table>{rows.length > 8 ? <p className="import-preview-more">+ {rows.length - 8} baris lainnya</p> : null}</div> : null}
        </div>
        <div className="import-modal-footer"><span>{rows.length && !errors.length ? `${rows.length} baris siap diimpor` : "Periksa file sebelum mengimpor"}</span><div><button className="secondary-button" type="button" onClick={close}>BATAL</button><button className="primary-button" type="button" onClick={() => void submit()} disabled={saving || !rows.length || errors.length > 0 || Boolean(report)}>{saving ? "MENGIMPOR..." : report ? "SUDAH DIIMPOR" : `IMPOR ${rows.length || ""} KARYAWAN`}</button></div></div>
      </section>
    </div> : null}
  </>;
}
