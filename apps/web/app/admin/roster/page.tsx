"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CustomMultiSelect, CustomSelect, SearchableSelect, type DropdownOption } from "../../components/custom-dropdown";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type Employee = {
  id: number;
  name: string;
  employeeCode: string;
  departmentCode: string | null;
  departmentName: string | null;
};

type Template = {
  id: string;
  name: string;
  code: string;
  kind: string;
  startTime: string;
  endTime: string;
};

type ScheduleProfile = {
  employeeId: number;
  scheduleTemplateId: string;
  scheduleTemplateCode: string;
  scheduleTemplateName: string;
  workdays: number[];
  weeklyTemplates?: Array<{ day: number; scheduleTemplateId: string }>;
};

type EmployeeWorkMode = { employeeId: number; mode: "FIXED" | "ROSTER" | "NONE"; rosterGroup: string | null };
type RosterView = "OVERVIEW" | "PIT" | "STEADY" | "EXCEPTION" | "UNCONFIGURED" | "ALL";
type DisplayGroupKind = "PIT" | "STEADY" | "EXCEPTION" | "UNCONFIGURED";
type DisplayGroup = {
  id: string;
  departmentKey: string;
  departmentName: string;
  label: string;
  subLabel?: string;
  kind: DisplayGroupKind;
  employees: Employee[];
};

type AssignmentType = "REGULAR" | "OFF" | "LEAVE" | "ON_CALL" | "OVERTIME";

type Assignment = {
  id: string;
  employeeId: number;
  assignmentDate: string;
  assignmentType: AssignmentType;
  scheduleTemplateId: string | null;
  scheduleTemplateName: string | null;
  scheduleTemplateCode: string | null;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
};
type BackupReason = "LEAVE" | "SICK" | "PERMISSION" | "TRAINING" | "OUT_OF_OFFICE" | "STAFFING" | "OTHER";
type RosterBackup = {
  id: string;
  coveredEmployeeId: number;
  backupEmployeeId: number;
  startDate: string;
  endDate: string;
  reason: BackupReason;
  reasonDetails: string | null;
  notes: string | null;
};

type PatternDraft = {
  employeeId: number;
  assignmentDate: string;
  assignmentType: "REGULAR" | "OFF";
  scheduleTemplateId: string | null;
  label: "P" | "M" | "OFF";
  className: "shift-morning" | "shift-night" | "shift-off";
};

const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const shortDays = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const assignmentOptions: DropdownOption[] = [
  { value: "REGULAR", label: "Reguler" },
  { value: "ON_CALL", label: "On-call" },
  { value: "OVERTIME", label: "Lembur" },
  { value: "LEAVE", label: "Cuti" },
  { value: "OFF", label: "Off" }
];
const backupReasonOptions: DropdownOption[] = [
  { value: "LEAVE", label: "Cuti" }, { value: "SICK", label: "Sakit" },
  { value: "PERMISSION", label: "Izin" }, { value: "TRAINING", label: "Pelatihan" },
  { value: "OUT_OF_OFFICE", label: "Tugas luar" }, { value: "STAFFING", label: "Kebutuhan personel" },
  { value: "OTHER", label: "Lainnya" }
];
const rosterViewOptions: DropdownOption[] = [
  { value: "OVERVIEW", label: "Ringkas per kelompok" },
  { value: "PIT", label: "Hanya Pit Crew" },
  { value: "STEADY", label: "Hanya Steady Day" },
  { value: "EXCEPTION", label: "Jadwal khusus per orang" },
  { value: "UNCONFIGURED", label: "Belum diatur" },
  { value: "ALL", label: "Semua karyawan" }
];
const crewPattern = ["P", "P", "P", "M", "M", "M", "OFF", "OFF", "OFF"] as const;
const crewPhaseOnReferenceDate = { A: 5, B: 8, C: 2 } as const;
const crewPatternReferenceDate = "2026-08-16";

function isPitCrewDepartment(name: string | null, code: string | null) {
  return /\bpit(?:\s*crew)?\b/i.test(`${code ?? ""} ${name ?? ""}`);
}

function scheduleClass(code: string | null, name: string | null) {
  const value = `${code ?? ""} ${name ?? ""}`.toUpperCase();
  if (/MALAM|(^|\s)M($|\s)/.test(value)) return "shift-night";
  if (/STEADY|(^|\s)SD($|\s)/.test(value)) return "shift-steady";
  if (value.includes("DRILL")) return "shift-drill";
  if (value.includes("MCR")) return "shift-mcr";
  if (/ADMIN|WEEKDAY|(^|\s)ADM($|\s)/.test(value)) return "shift-admin";
  return "shift-morning";
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateDifference(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function crewLetter(value: string | null) {
  return value?.match(/\bcrew\s*([abc])\b/i)?.[1]?.toUpperCase() as "A" | "B" | "C" | undefined;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 16);
}

function currentBookPeriod(date = new Date()) {
  return date.getDate() >= 16
    ? new Date(date.getFullYear(), date.getMonth(), 16)
    : new Date(date.getFullYear(), date.getMonth() - 1, 16);
}

function formatPeriod(start: Date, end: Date) {
  return `${start.getDate()} ${monthNames[start.getMonth()]} ${start.getFullYear()} - ${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
}

function cellKey(employeeId: number, date: string) {
  return `${employeeId}|${date}`;
}

function parseCellKey(key: string) {
  const separator = key.indexOf("|");
  return { employeeId: Number(key.slice(0, separator)), date: key.slice(separator + 1) };
}

function templateDisplayCode(code: string | null | undefined, name?: string | null): string {
  if (!code && !name) return "REG";
  const val = `${code ?? ""} ${name ?? ""}`.toUpperCase();
  if (val.includes("MALAM") || code?.toUpperCase() === "M") return "M";
  if (val.includes("PAGI") || code?.toUpperCase() === "P") return "P";
  if (val.includes("STEADY") || code?.toUpperCase() === "SD") return "SD";
  if (val.includes("DRILL")) return "DRILL";
  if (val.includes("MCR")) return "MCR";
  if (val.includes("ADM") || val.includes("ADMIN") || val.includes("WEEKDAY") || val.includes("SATURDAY")) return "ADM";
  return code ? code.replace(/_|-/g, " ").slice(0, 5).toUpperCase() : "REG";
}

function assignmentLabel(assignment: Assignment) {
  if (assignment.assignmentType === "REGULAR") {
    return templateDisplayCode(assignment.scheduleTemplateCode, assignment.scheduleTemplateName);
  }
  if (assignment.assignmentType === "ON_CALL") return "ON";
  if (assignment.assignmentType === "OVERTIME") return "OT";
  if (assignment.assignmentType === "LEAVE") return "CUTI";
  return "OFF";
}

function assignmentClass(assignment: Assignment) {
  if (assignment.assignmentType === "OFF") return "shift-off";
  if (assignment.assignmentType === "LEAVE") return "shift-leave";
  if (assignment.assignmentType === "ON_CALL") return "shift-oncall";
  if (assignment.assignmentType === "OVERTIME") return "shift-overtime";
  return scheduleClass(assignment.scheduleTemplateCode, assignment.scheduleTemplateName);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return payload?.error?.message ?? fallback;
}

export default function RosterPage() {
  const [periodStart, setPeriodStart] = useState(currentBookPeriod);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [profiles, setProfiles] = useState<ScheduleProfile[]>([]);
  const [workModes, setWorkModes] = useState<EmployeeWorkMode[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [backups, setBackups] = useState<RosterBackup[]>([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("ALL");
  const [rosterView, setRosterView] = useState<RosterView>("OVERVIEW");
  const [excludedGroups, setExcludedGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [editorKeys, setEditorKeys] = useState<string[]>([]);
  const [bulkEditor, setBulkEditor] = useState(false);
  const [draftType, setDraftType] = useState<AssignmentType>("REGULAR");
  const [draftTemplateId, setDraftTemplateId] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [patternPreview, setPatternPreview] = useState<PatternDraft[]>([]);
  const [backupEditorOpen, setBackupEditorOpen] = useState(false);
  const [backupCoveredId, setBackupCoveredId] = useState("");
  const [backupEmployeeId, setBackupEmployeeId] = useState("");
  const [backupStartDate, setBackupStartDate] = useState("");
  const [backupEndDate, setBackupEndDate] = useState("");
  const [backupReason, setBackupReason] = useState<BackupReason>("SICK");
  const [backupReasonDetails, setBackupReasonDetails] = useState("");
  const [backupNotes, setBackupNotes] = useState("");
  const overviewScrollRef = useRef<HTMLDivElement>(null);

  const periodEnd = useMemo(() => new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 15), [periodStart]);
  const days = useMemo(() => {
    const count = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1;
    return Array.from({ length: count }, (_, index) => addDays(periodStart, index));
  }, [periodEnd, periodStart]);
  const from = formatDate(periodStart);
  const to = formatDate(periodEnd);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rosterResponse, employeeResponse, templateResponse, profileResponse, workModeResponse, backupResponse] = await Promise.all([
        fetch(`${API_URL}/api/roster?from=${from}&to=${to}`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/employees`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/schedule-templates`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/schedule-profiles`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/employee-work-modes`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/roster-backups?from=${from}&to=${to}`, { credentials: "include", cache: "no-store" })
      ]);
      if (!rosterResponse.ok) throw new Error(await responseError(rosterResponse, "Gagal memuat roster"));
      if (!employeeResponse.ok) throw new Error(await responseError(employeeResponse, "Gagal memuat karyawan"));
      if (!templateResponse.ok) throw new Error(await responseError(templateResponse, "Gagal memuat template"));
      if (!profileResponse.ok) throw new Error(await responseError(profileResponse, "Gagal memuat profil kerja"));
      if (!workModeResponse.ok) throw new Error(await responseError(workModeResponse, "Gagal memuat pola kerja"));
      if (!backupResponse.ok) throw new Error(await responseError(backupResponse, "Gagal memuat penugasan backup"));
      const [rosterPayload, employeePayload, templatePayload, profilePayload, workModePayload, backupPayload] = await Promise.all([
        rosterResponse.json() as Promise<{ records?: Assignment[] }>,
        employeeResponse.json() as Promise<{ records?: Employee[] }>,
        templateResponse.json() as Promise<{ records?: Template[] }>,
        profileResponse.json() as Promise<{ records?: ScheduleProfile[] }>,
        workModeResponse.json() as Promise<{ records?: EmployeeWorkMode[] }>,
        backupResponse.json() as Promise<{ records?: RosterBackup[] }>
      ]);
      setAssignments(rosterPayload.records ?? []);
      setEmployees(employeePayload.records ?? []);
      setTemplates(templatePayload.records ?? []);
      setProfiles(profilePayload.records ?? []);
      setWorkModes(workModePayload.records ?? []);
      setBackups(backupPayload.records ?? []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat kalender roster");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const profileByEmployee = useMemo(() => new Map(profiles.map((profile) => [profile.employeeId, profile])), [profiles]);
  const templateById = useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates]);
  const workModeByEmployee = useMemo(() => new Map(workModes.map((item) => [item.employeeId, item])), [workModes]);
  const modeFor = useCallback((employee: Employee): EmployeeWorkMode["mode"] => {
    const explicit = workModeByEmployee.get(employee.id)?.mode;
    if (explicit) return explicit;
    return isPitCrewDepartment(employee.departmentName, employee.departmentCode) ? "ROSTER" : employee.departmentName ? "FIXED" : "NONE";
  }, [workModeByEmployee]);
  const displayGroupFor = useCallback((employee: Employee): Omit<DisplayGroup, "employees"> => {
    const mode = workModeByEmployee.get(employee.id);
    const profile = profileByEmployee.get(employee.id);
    const isPitCrew = isPitCrewDepartment(employee.departmentName, employee.departmentCode);
    const isSpecialProfile = profile && profile.scheduleTemplateCode !== "STEADY_DAY";
    const rosterGroup = mode?.rosterGroup?.trim();

    if (isPitCrew) {
      const deptKey = "pit";
      const deptName = "Crew PIT";

      if (mode?.mode === "ROSTER" && rosterGroup) {
        const crew = crewLetter(rosterGroup);
        const label = crew ? `Crew ${crew}` : rosterGroup;
        return {
          id: `pit:roster:${label.toLowerCase().replace(/\s+/g, "_")}`,
          departmentKey: deptKey,
          departmentName: deptName,
          label,
          subLabel: "Rotasi 3P / 3M / 3OFF",
          kind: "PIT"
        };
      }
      if (modeFor(employee) === "FIXED") {
        const profileCode = profile?.scheduleTemplateCode ?? "STEADY_DAY";
        if (profileCode === "STEADY_DAY") {
          return {
            id: "pit:fixed:sd",
            departmentKey: deptKey,
            departmentName: deptName,
            label: "SD",
            subLabel: "Steady Day",
            kind: "PIT"
          };
        }
        if (profileCode === "DRILL") {
          return {
            id: "pit:fixed:drill",
            departmentKey: deptKey,
            departmentName: deptName,
            label: "Drill",
            subLabel: "Jadwal Drill",
            kind: "PIT"
          };
        }
        if (profileCode === "MCR") {
          return {
            id: "pit:fixed:mcr",
            departmentKey: deptKey,
            departmentName: deptName,
            label: "MCR",
            subLabel: "Jadwal MCR",
            kind: "PIT"
          };
        }
        if (profileCode.startsWith("ADM") || profileCode.includes("WEEKDAY")) {
          return {
            id: "pit:fixed:adm",
            departmentKey: deptKey,
            departmentName: deptName,
            label: "Administrasi",
            subLabel: "Senin - Jumat",
            kind: "PIT"
          };
        }
        return {
          id: `pit:fixed:${profileCode.toLowerCase()}`,
          departmentKey: deptKey,
          departmentName: deptName,
          label: profile?.scheduleTemplateName || profileCode.replaceAll("_", " "),
          subLabel: "Jadwal tetap",
          kind: "PIT"
        };
      }
      if (isSpecialProfile) {
        return {
          id: "pit:exception",
          departmentKey: deptKey,
          departmentName: deptName,
          label: "Jadwal Khusus",
          subLabel: "Profil khusus di Pit Crew",
          kind: "EXCEPTION"
        };
      }
      return {
        id: "pit:unconfigured",
        departmentKey: deptKey,
        departmentName: deptName,
        label: "Belum pilih kelompok",
        subLabel: "Perlu atur pola kerja",
        kind: "UNCONFIGURED"
      };
    }

    const deptName = employee.departmentName ?? "Belum dipetakan";
    const deptKey = employee.departmentName ? `dept:${(employee.departmentCode || employee.departmentName).toLowerCase().replace(/\s+/g, "_")}` : "unmapped";

    if (isSpecialProfile) {
      return {
        id: `exception:${employee.id}`,
        departmentKey: deptKey,
        departmentName: deptName,
        label: `${employee.name} (Khusus)`,
        subLabel: profile?.scheduleTemplateName || "Jadwal khusus",
        kind: "EXCEPTION"
      };
    }
    if (modeFor(employee) === "FIXED" || employee.departmentName) {
      return {
        id: `steady:${deptKey}`,
        departmentKey: deptKey,
        departmentName: deptName,
        label: deptName,
        subLabel: "Pola Steady Day",
        kind: "STEADY"
      };
    }
    return {
      id: "setup:unmapped",
      departmentKey: "unmapped",
      departmentName: "Belum dipetakan",
      label: "Belum dipetakan",
      subLabel: "Departemen belum diatur",
      kind: "UNCONFIGURED"
    };
  }, [modeFor, profileByEmployee, workModeByEmployee]);

  const groupFor = useCallback((employee: Employee) => displayGroupFor(employee).label, [displayGroupFor]);
  const availableGroups = useMemo(() => [...new Set(employees.map(groupFor))].sort(), [employees, groupFor]);
  const selectedGroups = useMemo(() => availableGroups.filter((group) => !excludedGroups.includes(group)), [availableGroups, excludedGroups]);
  const departments = useMemo(() => [...new Set(employees.map((employee) => employee.departmentName).filter(Boolean))].sort() as string[], [employees]);
  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchesSearch = !term || `${employee.name} ${employee.employeeCode} ${employee.departmentName ?? ""}`.toLowerCase().includes(term);
      const matchesDepartment = department === "ALL" || (department === "UNMAPPED" ? !employee.departmentName : employee.departmentName === department);
      const group = displayGroupFor(employee);
      const matchesView = rosterView === "ALL"
        || (rosterView === "OVERVIEW" && group.kind !== "UNCONFIGURED")
        || (rosterView === "PIT" && group.kind === "PIT")
        || (rosterView === "STEADY" && group.kind === "STEADY")
        || (rosterView === "EXCEPTION" && group.kind === "EXCEPTION")
        || (rosterView === "UNCONFIGURED" && group.kind === "UNCONFIGURED");
      return matchesSearch && matchesDepartment && matchesView && selectedGroups.includes(groupFor(employee));
    });
  }, [department, displayGroupFor, employees, groupFor, rosterView, search, selectedGroups]);
  const displayGroups = useMemo<DisplayGroup[]>(() => {
    const grouped = new Map<string, DisplayGroup>();
    for (const employee of filteredEmployees) {
      const descriptor = displayGroupFor(employee);
      const current = grouped.get(descriptor.id);
      if (current) current.employees.push(employee);
      else grouped.set(descriptor.id, { ...descriptor, employees: [employee] });
    }
    const order: Record<DisplayGroupKind, number> = { PIT: 0, STEADY: 1, EXCEPTION: 2, UNCONFIGURED: 3 };
    return [...grouped.values()].sort((left, right) => order[left.kind] - order[right.kind] || left.label.localeCompare(right.label, "id-ID"));
  }, [displayGroupFor, filteredEmployees]);

  type DepartmentSection = {
    key: string;
    name: string;
    totalEmployees: number;
    groups: DisplayGroup[];
  };

  const departmentSections = useMemo<DepartmentSection[]>(() => {
    const map = new Map<string, DepartmentSection>();
    for (const group of displayGroups) {
      const existing = map.get(group.departmentKey);
      if (existing) {
        existing.totalEmployees += group.employees.length;
        existing.groups.push(group);
      } else {
        map.set(group.departmentKey, {
          key: group.departmentKey,
          name: group.departmentName.trim() || (group.departmentKey === "pit" ? "Crew PIT" : "Belum dipetakan"),
          totalEmployees: group.employees.length,
          groups: [group]
        });
      }
    }

    const pitRank = (label: string) => {
      if (label.includes("Crew A")) return 1;
      if (label.includes("Crew B")) return 2;
      if (label.includes("Crew C")) return 3;
      if (label.includes("Drill")) return 4;
      if (label.includes("MCR")) return 5;
      if (label === "SD" || label.includes("Steady")) return 6;
      if (label.includes("Admin")) return 7;
      return 8;
    };

    return [...map.values()]
      .sort((a, b) => {
        const orderA = a.key === "pit" ? 0 : a.key === "unmapped" ? 99 : 1;
        const orderB = b.key === "pit" ? 0 : b.key === "unmapped" ? 99 : 1;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name, "id-ID");
      })
      .map((section) => ({
        ...section,
        groups: section.groups.sort((a, b) => {
          if (section.key === "pit") {
            return pitRank(a.label) - pitRank(b.label) || a.label.localeCompare(b.label, "id-ID");
          }
          return a.label.localeCompare(b.label, "id-ID");
        })
      }));
  }, [displayGroups]);

  const expandedGroups = useMemo(() => displayGroups.filter((group) => expandedGroupIds.includes(group.id)), [displayGroups, expandedGroupIds]);
  const detailedEmployees = useMemo(() => expandedGroups.flatMap((group) => group.employees), [expandedGroups]);
  const monthGroups = useMemo(() => {
    const groups: Array<{ label: string; count: number }> = [];
    for (const day of days) {
      const label = `${monthNames[day.getMonth()]} ${day.getFullYear()}`;
      const latest = groups.at(-1);
      if (latest?.label === label) latest.count += 1;
      else groups.push({ label, count: 1 });
    }
    return groups;
  }, [days]);

  const assignmentsByCell = useMemo(() => {
    const result = new Map<string, Assignment[]>();
    for (const assignment of assignments) {
      const key = cellKey(assignment.employeeId, assignment.assignmentDate);
      result.set(key, [...(result.get(key) ?? []), assignment]);
    }
    return result;
  }, [assignments]);
  const backupsByCell = useMemo(() => {
    const result = new Map<string, RosterBackup[]>();
    for (const backup of backups) {
      for (const day of days) {
        const date = formatDate(day);
        if (date < backup.startDate || date > backup.endDate) continue;
        const key = cellKey(backup.backupEmployeeId, date);
        result.set(key, [...(result.get(key) ?? []), backup]);
      }
    }
    return result;
  }, [backups, days]);
  const patternPreviewByCell = useMemo(() => new Map(patternPreview.map((draft) => [cellKey(draft.employeeId, draft.assignmentDate), draft])), [patternPreview]);
  const groupCellState = useCallback((group: DisplayGroup, date: string) => {
    const preview = group.employees.map((employee) => patternPreviewByCell.get(cellKey(employee.id, date))).filter((draft): draft is PatternDraft => Boolean(draft));
    if (preview.length > 0) {
      const labels = [...new Set(preview.map((draft) => draft.label))];
      if (labels.length === 1 && preview.length === group.employees.length) {
        return { label: labels[0]!, className: preview[0]!.className, detail: `${labels[0]} · preview pola, belum diterbitkan` };
      }
      return { label: `${preview.length}P`, className: "roster-group-mixed", detail: `${preview.length} jadwal dalam preview` };
    }
    const relevant = group.employees.flatMap((employee) => assignmentsByCell.get(cellKey(employee.id, date)) ?? []);
    const fixedProfiles = group.employees.map((employee) => modeFor(employee) === "FIXED" ? profileByEmployee.get(employee.id) : undefined);
    const isFixedProfileGroup = fixedProfiles.every(Boolean);
    if (isFixedProfileGroup && relevant.length === 0) {
      const weekday = new Date(`${date}T00:00:00`).getDay() || 7;
      const workingProfiles = fixedProfiles.filter((profile) => profile!.workdays.includes(weekday)) as ScheduleProfile[];
      if (workingProfiles.length === 0) return { label: "OFF", className: "shift-off", detail: "Di luar hari kerja" };
      const dailyTemplates = workingProfiles.map((profile) => {
        const dailyId = profile.weeklyTemplates?.find((item) => item.day === weekday)?.scheduleTemplateId ?? profile.scheduleTemplateId;
        return templateById.get(dailyId) ?? { code: profile.scheduleTemplateCode, name: profile.scheduleTemplateName };
      });
      const labels = [...new Set(dailyTemplates.map((template) => templateDisplayCode(template.code, template.name)))];
      if (labels.length === 1 && workingProfiles.length === group.employees.length) {
        const template = dailyTemplates[0]!;
        return { label: labels[0]!, className: scheduleClass(template.code, template.name), detail: `${template.name} otomatis dari profil kerja` };
      }
      return { label: `${workingProfiles.length} POLA`, className: "roster-group-mixed", detail: `${workingProfiles.length} karyawan masuk jadwal tetap` };
    }
    if (group.kind === "STEADY" && relevant.length === 0) {
      const isWeekend = [0, 6].includes(new Date(`${date}T00:00:00`).getDay());
      return isWeekend ? { label: "OFF", className: "shift-off", detail: "Off akhir pekan" } : { label: "SD", className: "shift-steady", detail: "Steady Day otomatis" };
    }
    if (relevant.length === 0) {
      return group.kind === "PIT"
        ? { label: "ATUR", className: "roster-group-empty", detail: "Belum ada pola roster" }
        : { label: "—", className: "roster-group-empty", detail: "Tidak ada penugasan" };
    }
    const labels = [...new Set(relevant.map(assignmentLabel))];
    if (labels.length === 1 && relevant.length === group.employees.length) {
      return { label: labels[0]!, className: assignmentClass(relevant[0]!), detail: `${labels[0]} untuk semua anggota` };
    }
    const offCount = relevant.filter((item) => item.assignmentType === "OFF").length;
    if (offCount === relevant.length) {
      return { label: "OFF", className: "shift-off", detail: `${offCount} karyawan Off` };
    }
    if (relevant.length === 1 && relevant[0]?.assignmentType === "OFF") {
      return { label: "1 OFF", className: "roster-group-mixed", detail: "1 karyawan Off khusus" };
    }
    return { label: `${relevant.length}★`, className: "roster-group-mixed", detail: `${relevant.length} penugasan khusus (${labels.join(", ")})` };
  }, [assignmentsByCell, modeFor, patternPreviewByCell, profileByEmployee, templateById]);

  const groupOptions = useMemo<DropdownOption[]>(() => availableGroups.map((group) => ({ value: group, label: group })), [availableGroups]);
  const departmentOptions = useMemo<DropdownOption[]>(() => [
    { value: "ALL", label: "Semua departemen" },
    { value: "UNMAPPED", label: "Belum dipetakan" },
    ...departments.map((name) => ({ value: name, label: name }))
  ], [departments]);
  const templateOptions = useMemo<DropdownOption[]>(() => [
    { value: "", label: draftType === "REGULAR" ? "Pilih template jam" : "Tanpa template jam" },
    ...templates.map((template) => ({ value: template.id, label: `${template.code} | ${template.startTime}-${template.endTime}` }))
  ], [draftType, templates]);

  const closeEditor = () => {
    setEditorKeys([]);
    setBulkEditor(false);
  };

  const prepareEditor = (keys: string[], isBulk: boolean) => {
    const firstAssignment = keys.length === 1 ? assignmentsByCell.get(keys[0]!)?.[0] : undefined;
    setDraftType(firstAssignment?.assignmentType ?? "REGULAR");
    setDraftTemplateId(firstAssignment?.scheduleTemplateId ?? "");
    setDraftNotes(firstAssignment?.notes ?? "");
    setEditorKeys(keys);
    setBulkEditor(isBulk);
    setError("");
  };

  const toggleBulkMode = () => {
    if (bulkMode) {
      setBulkMode(false);
      setSelectedCells([]);
      setNotice("Pemilihan massal dibatalkan.");
      return;
    }
    setBulkMode(true);
    setNotice("Klik beberapa sel atau angka tanggal untuk memilih satu kolom.");
  };

  const selectCell = (key: string) => {
    if (!bulkMode) {
      prepareEditor([key], false);
      return;
    }
    setSelectedCells((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const toggleColumn = (date: string) => {
    const keys = filteredEmployees.map((employee) => cellKey(employee.id, date));
    if (keys.length === 0) return;
    const allSelected = keys.every((key) => selectedCells.includes(key));
    setBulkMode(true);
    setSelectedCells((current) => allSelected ? current.filter((key) => !keys.includes(key)) : [...new Set([...current, ...keys])]);
    setNotice(allSelected ? "Kolom tanggal dikeluarkan dari pilihan." : `${keys.length} sel pada tanggal tersebut dipilih.`);
  };

  const toggleGroupDate = (group: DisplayGroup, date: string) => {
    const keys = group.employees.map((employee) => cellKey(employee.id, date));
    const allSelected = keys.every((key) => selectedCells.includes(key));
    setBulkMode(true);
    setSelectedCells((current) => allSelected ? current.filter((key) => !keys.includes(key)) : [...new Set([...current, ...keys])]);
    setNotice(allSelected ? `${group.label} pada tanggal ini dikeluarkan dari pilihan.` : `${keys.length} anggota ${group.label} dipilih.`);
  };

  const toggleGroupDetails = (groupId: string) => {
    setExpandedGroupIds((current) => current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]);
    setSelectedCells([]);
    setBulkMode(false);
    setNotice("");
  };

  const openBackupEditor = () => {
    setBackupCoveredId("");
    setBackupEmployeeId("");
    setBackupStartDate(from);
    setBackupEndDate(to);
    setBackupReason("SICK");
    setBackupReasonDetails("");
    setBackupNotes("");
    setBackupEditorOpen(true);
    setError("");
  };

  const saveBackup = async () => {
    const coveredEmployeeId = Number(backupCoveredId);
    const replacementEmployeeId = Number(backupEmployeeId);
    if (!Number.isInteger(coveredEmployeeId) || !Number.isInteger(replacementEmployeeId) || !backupStartDate || !backupEndDate) {
      setError("Pilih karyawan yang digantikan, karyawan backup, dan rentang tanggal.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/roster-backups`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coveredEmployeeId,
          backupEmployeeId: replacementEmployeeId,
          startDate: backupStartDate,
          endDate: backupEndDate,
          reason: backupReason,
          reasonDetails: backupReason === "OTHER" ? backupReasonDetails : null,
          notes: backupNotes || null
        })
      });
      if (!response.ok) throw new Error(await responseError(response, "Gagal menyimpan penugasan backup"));
      setBackupEditorOpen(false);
      await load();
      setNotice("Penugasan backup tersimpan. Jadwal asli kedua karyawan tidak diubah.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menyimpan penugasan backup");
    } finally {
      setSaving(false);
    }
  };

  const removeBackup = async (backup: RosterBackup) => {
    if (!window.confirm("Hapus penugasan backup ini?")) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/roster-backups/${backup.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error(await responseError(response, "Gagal menghapus penugasan backup"));
      await load();
      setNotice("Penugasan backup dihapus.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menghapus penugasan backup");
    } finally {
      setSaving(false);
    }
  };

  const createCrewPatternPreview = () => {
    const morningTemplate = templates.find((template) => template.code === "SHIFT_PAGI");
    const nightTemplate = templates.find((template) => template.code === "SHIFT_MALAM");
    if (!morningTemplate || !nightTemplate) {
      setError("Generator membutuhkan template aktif SHIFT_PAGI dan SHIFT_MALAM.");
      return;
    }
    const crewEmployees = employees.flatMap((employee) => {
      if (displayGroupFor(employee).kind !== "PIT") return [];
      const letter = crewLetter(workModeByEmployee.get(employee.id)?.rosterGroup ?? null);
      return letter ? [{ employee, letter }] : [];
    });
    if (crewEmployees.length === 0) {
      setError("Belum ada karyawan yang dipetakan ke kelompok Crew A, Crew B, atau Crew C.");
      return;
    }
    const preview = crewEmployees.flatMap(({ employee, letter }) => days.map((day): PatternDraft => {
      const assignmentDate = formatDate(day);
      const index = positiveModulo(dateDifference(crewPatternReferenceDate, assignmentDate) + crewPhaseOnReferenceDate[letter], crewPattern.length);
      const shift = crewPattern[index]!;
      if (shift === "P") return { employeeId: employee.id, assignmentDate, assignmentType: "REGULAR", scheduleTemplateId: morningTemplate.id, label: "P", className: "shift-morning" };
      if (shift === "M") return { employeeId: employee.id, assignmentDate, assignmentType: "REGULAR", scheduleTemplateId: nightTemplate.id, label: "M", className: "shift-night" };
      return { employeeId: employee.id, assignmentDate, assignmentType: "OFF", scheduleTemplateId: null, label: "OFF", className: "shift-off" };
    }));
    setPatternPreview(preview);
    setRosterView("PIT");
    setSearch("");
    setDepartment("ALL");
    setExcludedGroups([]);
    setBulkMode(false);
    setSelectedCells([]);
    setError("");
    setNotice(`Preview pola dibuat untuk ${crewEmployees.length} karyawan PIT. Periksa kalender lalu terbitkan.`);
  };

  const publishCrewPattern = async () => {
    if (patternPreview.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/roster/bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignments: patternPreview.map(({ employeeId, assignmentDate, assignmentType, scheduleTemplateId }) => ({
            employeeId,
            assignmentDate,
            assignmentType,
            scheduleTemplateId,
            notes: "Pola otomatis PIT Crew · 3 Pagi, 3 Malam, 3 OFF"
          })),
          replaceBaseSchedule: true
        })
      });
      if (!response.ok) throw new Error(await responseError(response, "Gagal menerbitkan pola roster"));
      const count = patternPreview.length;
      setPatternPreview([]);
      await load();
      setNotice(`${count} sel pola Crew A/B/C berhasil diterbitkan.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menerbitkan pola roster");
    } finally {
      setSaving(false);
    }
  };

  const saveAssignments = async () => {
    if (editorKeys.length === 0) return;
    if (draftType === "REGULAR" && !draftTemplateId) {
      setError("Jadwal reguler wajib memakai template jam.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const scheduleTemplateId = draftType === "OFF" || draftType === "LEAVE" ? null : draftTemplateId || null;
      const assignmentsToSave = editorKeys.map((key) => {
        const { employeeId, date } = parseCellKey(key);
        return { employeeId, assignmentDate: date, assignmentType: draftType, scheduleTemplateId, notes: draftNotes || null };
      });
      const response = await fetch(`${API_URL}/api/roster/bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignments: assignmentsToSave, replaceBaseSchedule: draftType === "REGULAR" || draftType === "OFF" })
      });
      if (!response.ok) throw new Error(await responseError(response, "Gagal menyimpan roster secara massal"));
      const count = editorKeys.length;
      closeEditor();
      setSelectedCells([]);
      setBulkMode(false);
      await load();
      setNotice(`${count} sel roster berhasil disimpan.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menyimpan roster");
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (assignment: Assignment) => {
    if (!window.confirm(`Hapus ${assignmentLabel(assignment)} pada ${assignment.assignmentDate}?`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/roster/${assignment.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error(await responseError(response, "Gagal menghapus roster"));
      await load();
      setNotice("Penugasan roster dihapus.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menghapus roster");
    } finally {
      setSaving(false);
    }
  };

  const clearEditorCells = async () => {
    const records = editorKeys.flatMap((key) => assignmentsByCell.get(key) ?? []);
    if (records.length === 0) {
      closeEditor();
      return;
    }
    if (!window.confirm(`Hapus ${records.length} penugasan dari sel yang dipilih?`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/roster/bulk`, {
        method: "DELETE",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: records.map((assignment) => assignment.id) })
      });
      if (!response.ok) throw new Error(await responseError(response, "Gagal mengosongkan roster secara massal"));
      closeEditor();
      setSelectedCells([]);
      setBulkMode(false);
      await load();
      setNotice(`${records.length} penugasan roster dihapus.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal mengosongkan roster");
    } finally {
      setSaving(false);
    }
  };

  const firstEditorCell = editorKeys[0] ? parseCellKey(editorKeys[0]) : null;
  const editorEmployee = firstEditorCell ? employees.find((employee) => employee.id === firstEditorCell.employeeId) : null;
  const existingEditorAssignments = !bulkEditor && editorKeys[0] ? assignmentsByCell.get(editorKeys[0]) ?? [] : [];
  const today = formatDate(new Date());

  useEffect(() => {
    if (loading || displayGroups.length === 0 || today < from || today > to) return;
    const scrollToToday = () => {
      const scrollArea = overviewScrollRef.current;
      const currentCell = scrollArea?.querySelector<HTMLElement>("td.is-today");
      if (!scrollArea || !currentCell) return;
      const area = scrollArea.getBoundingClientRect();
      const cell = currentCell.getBoundingClientRect();
      const left = scrollArea.scrollLeft + cell.left - area.left - (scrollArea.clientWidth - cell.width) / 2;
      scrollArea.scrollTo({
        left: Math.max(0, left),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
    };
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollToToday);
    });
    const fallback = window.setTimeout(scrollToToday, 180);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearTimeout(fallback);
    };
  }, [displayGroups.length, from, loading, to, today]);

  const changePeriod = (amount: number) => {
    setPeriodStart((current) => addMonths(current, amount));
    setSelectedCells([]);
    setBulkMode(false);
    closeEditor();
    setPatternPreview([]);
    setNotice("");
  };

  return (
    <div className="roster-calendar-page">
      <header className="roster-simple-header roster-live-header">
        <div><span>Jadwal kerja</span><h1>Kalender roster</h1><p>Periode kerja tanggal 16 sampai 15. Geser kalender untuk melihat seluruh tanggal.</p></div>
        <div className="roster-preview-period" aria-label="Navigasi periode roster">
          <button type="button" aria-label="Periode sebelumnya" onClick={() => changePeriod(-1)}>←</button>
          <strong aria-live="polite">{formatPeriod(periodStart, periodEnd)}</strong>
          <button type="button" aria-label="Periode berikutnya" onClick={() => changePeriod(1)}>→</button>
        </div>
      </header>

      {error ? <div className="notice notice-error roster-live-notice" role="alert"><strong>Roster belum diperbarui</strong><span>{error}</span></div> : null}
      {notice && !error ? <div className="roster-preview-notice roster-live-notice" role="status">{notice}</div> : null}

      <section className="roster-preview-workspace roster-live-workspace" aria-label="Kalender roster periode tutup buku">
        <div className="roster-simple-toolbar">
          <label><span>Cari</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama atau kode karyawan" /></label>
          <div className="roster-filter-field"><span>Mode tampilan</span><CustomSelect ariaLabel="Pilih cakupan roster" value={rosterView} options={rosterViewOptions} onChange={(value) => setRosterView(value as RosterView)} /></div>
          <div className="roster-filter-field">
            <span>Kelompok</span>
            <CustomMultiSelect
              ariaLabel="Filter kelompok kerja"
              values={selectedGroups}
              options={groupOptions}
              allLabel="Semua kelompok"
              selectionLabel={(count) => `${count} kelompok dipilih`}
              onChange={(values) => setExcludedGroups(availableGroups.filter((group) => !values.includes(group)))}
            />
          </div>
          <div className="roster-filter-field"><span>Departemen</span><CustomSelect ariaLabel="Filter departemen" value={department} options={departmentOptions} onChange={setDepartment} /></div>
          <div className="roster-simple-actions">
            <button className="roster-preview-secondary" type="button" onClick={createCrewPatternPreview} disabled={loading || saving}>Buat pola Crew A/B/C</button>
            <button className={bulkMode ? "roster-preview-secondary is-active" : "roster-preview-secondary"} type="button" aria-pressed={bulkMode} onClick={toggleBulkMode}>{bulkMode ? "Batalkan pilihan" : "Atur banyak jadwal"}</button>
            <button className="roster-preview-secondary" type="button" onClick={openBackupEditor} disabled={loading || saving}>Atur backup</button>
            <button className="roster-preview-primary" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Memuat..." : "Muat ulang"}</button>
          </div>
        </div>

        <div className="roster-reading-guide" aria-label="Petunjuk kalender roster">
          <span>Klik nama kelompok untuk melihat anggota.</span>
        </div>

        {bulkMode ? <div className="roster-bulk-bar" role="status"><div><strong>{selectedCells.length} sel dipilih</strong><span>{notice || "Klik sel kelompok untuk memilih anggota pada satu tanggal, atau angka tanggal untuk semua hasil filter."}</span></div><div><button className="roster-preview-secondary" type="button" disabled={selectedCells.length === 0} onClick={() => { setSelectedCells([]); setNotice("Semua pilihan dikosongkan."); }}>Kosongkan</button><button className="roster-preview-primary" type="button" disabled={selectedCells.length === 0} onClick={() => prepareEditor(selectedCells, true)}>Atur jadwal</button></div></div> : null}
        {patternPreview.length > 0 ? <div className="roster-pattern-bar" role="status"><div><strong>Preview pola 3 Pagi · 3 Malam · 3 OFF</strong><span>{patternPreview.length / days.length} karyawan · {patternPreview.length} sel · belum tersimpan</span></div><div><button className="roster-preview-secondary" type="button" disabled={saving} onClick={() => { setPatternPreview([]); setNotice("Preview pola dibatalkan."); }}>Batal</button><button className="roster-preview-primary" type="button" disabled={saving} onClick={() => void publishCrewPattern()}>{saving ? "Menerbitkan..." : "Terbitkan pola"}</button></div></div> : null}
        {backups.length > 0 ? <section className="roster-backup-summary" aria-label="Penugasan backup aktif"><div><strong>Backup aktif</strong><span>Penugasan ini tidak mengubah jadwal asli.</span></div><ul>{backups.map((backup) => {
          const covered = employees.find((employee) => employee.id === backup.coveredEmployeeId)?.name ?? `Karyawan ${backup.coveredEmployeeId}`;
          const replacement = employees.find((employee) => employee.id === backup.backupEmployeeId)?.name ?? `Karyawan ${backup.backupEmployeeId}`;
          const reason = backupReasonOptions.find((item) => item.value === backup.reason)?.label ?? backup.reason;
          return <li key={backup.id}><span><b>{replacement}</b> backup <b>{covered}</b><small>{backup.startDate} s.d. {backup.endDate} · {reason}{backup.reasonDetails ? `: ${backup.reasonDetails}` : ""}</small></span><button type="button" onClick={() => void removeBackup(backup)} disabled={saving}>Hapus</button></li>;
        })}</ul></section> : null}

        {loading ? <div className="table-skeleton roster-live-loading">{Array.from({ length: 6 }).map((_, index) => <span key={index} />)}</div> : null}
        {!loading && filteredEmployees.length === 0 ? <div className="feedback-state roster-live-empty"><strong>{rosterView === "OVERVIEW" ? "Belum ada kelompok operasional." : "Karyawan tidak ditemukan."}</strong><p>{rosterView === "OVERVIEW" ? "Tetapkan departemen karyawan. PIT Crew masuk roster, sementara departemen lain otomatis menjadi Steady Day." : "Ubah pencarian atau pilihan filter."}</p></div> : null}
        {!loading && displayGroups.length > 0 ? (
          <div className="roster-simple-scroll" ref={overviewScrollRef}>
            <table className="roster-simple-table roster-group-table">
              <thead>
                <tr className="roster-month-row"><th rowSpan={3} className="roster-col-dept-header">Departemen</th>{monthGroups.map((group) => <th colSpan={group.count} key={group.label}>{group.label}</th>)}</tr>
                <tr className="roster-weekday-row">{days.map((day) => { const date = formatDate(day); return <th className={`${day.getDay() === 0 ? "is-sunday " : ""}${date < today ? "is-past " : ""}${date === today ? "is-today" : ""}`} key={date}>{shortDays[day.getDay()]}</th>; })}</tr>
                <tr className="roster-date-row">{days.map((day) => { const date = formatDate(day); return <th className={`${day.getDay() === 0 ? "is-sunday " : ""}${date < today ? "is-past " : ""}${date === today ? "is-today" : ""}`} key={date}>{bulkMode ? <button className="roster-group-date roster-group-date-button" type="button" onClick={() => toggleColumn(date)} title="Pilih semua hasil filter pada tanggal ini">{day.getDate()}</button> : <span className="roster-group-date">{day.getDate()}</span>}</th>; })}</tr>
              </thead>
              <tbody>
                {departmentSections.map((section) => (
                  <Fragment key={section.key}>
                    <tr className="roster-department-band">
                      <th colSpan={days.length + 1} scope="rowgroup">{section.name}</th>
                    </tr>
                    {section.groups.map((group) => (
                      <tr key={group.id} className={`roster-group-row roster-group-${group.kind.toLowerCase()}`}>
                        <th scope="row" className="roster-group-header-cell">
                          <button
                            type="button"
                            className="roster-group-title-button"
                            aria-expanded={expandedGroupIds.includes(group.id)}
                            aria-label={`${expandedGroupIds.includes(group.id) ? "Sembunyikan" : "Lihat"} anggota ${group.label}`}
                            title={`${expandedGroupIds.includes(group.id) ? "Sembunyikan" : "Lihat"} anggota ${group.label}`}
                            onClick={() => toggleGroupDetails(group.id)}
                          >
                            {group.label}
                          </button>
                        </th>
                        {days.map((day) => {
                          const date = formatDate(day);
                          const state = groupCellState(group, date);
                          const selected = group.employees.every((employee) => selectedCells.includes(cellKey(employee.id, date)));
                          return (
                            <td className={`${day.getDay() === 0 ? "is-sunday " : ""}${date < today ? "is-past " : ""}${date === today ? "is-today" : ""}`} key={`${group.id}-${date}`}>
                              <button
                                type="button"
                                disabled={!bulkMode}
                                className={`roster-group-cell ${state.className}${selected ? " is-selected" : ""}`}
                                title={bulkMode ? `Pilih ${group.label} pada ${date}` : state.detail}
                                onClick={() => toggleGroupDate(group, date)}
                              >
                                {state.label}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && detailedEmployees.length > 0 ? (
          <section className="roster-detail-section" aria-label="Detail anggota kelompok">
            <div className="roster-detail-heading"><div><strong>Jadwal per karyawan</strong><span>{expandedGroups.map((group) => group.label).join(", ")}</span></div><span>{detailedEmployees.length} karyawan ditampilkan</span></div>
            <div className="roster-simple-scroll">
              <table className="roster-simple-table roster-detail-table">
                <thead>
                  <tr className="roster-month-row"><th rowSpan={3}>Karyawan</th>{monthGroups.map((group) => <th colSpan={group.count} key={group.label}>{group.label}</th>)}</tr>
                  <tr className="roster-weekday-row">{days.map((day) => { const date = formatDate(day); return <th className={`${day.getDay() === 0 ? "is-sunday " : ""}${date < today ? "is-past " : ""}${date === today ? "is-today" : ""}`} key={date}>{shortDays[day.getDay()]}</th>; })}</tr>
                  <tr className="roster-date-row">{days.map((day) => {
                    const date = formatDate(day);
                    const keys = detailedEmployees.map((employee) => cellKey(employee.id, date));
                    const columnSelected = keys.length > 0 && keys.every((key) => selectedCells.includes(key));
                    return <th className={`${day.getDay() === 0 ? "is-sunday " : ""}${date < today ? "is-past " : ""}${date === today ? "is-today" : ""}`} key={date}><button type="button" className={columnSelected ? "roster-day-select is-selected" : "roster-day-select"} aria-pressed={columnSelected} aria-label={`Pilih anggota terbuka tanggal ${day.getDate()} ${monthNames[day.getMonth()]}`} onClick={() => toggleColumn(date)}>{day.getDate()}</button></th>;
                  })}</tr>
                </thead>
                <tbody>
                  {detailedEmployees.map((employee) => (
                    <tr key={employee.id}>
                      <th scope="row"><span className="roster-preview-avatar" aria-hidden="true">{initials(employee.name)}</span><span><strong>{employee.name}</strong><small>{employee.employeeCode} | {groupFor(employee)} | {employee.departmentName ?? "Belum dipetakan"}</small></span></th>
                    {days.map((day) => {
                      const date = formatDate(day);
                      const key = cellKey(employee.id, date);
                      const cellAssignments = assignmentsByCell.get(key) ?? [];
                      const cellBackups = backupsByCell.get(key) ?? [];
                      const selected = selectedCells.includes(key) || editorKeys.includes(key);
                      return (
                        <td className={`${day.getDay() === 0 ? "is-sunday " : ""}${date < today ? "is-past " : ""}${date === today ? "is-today" : ""}`} key={key}>
                          <button type="button" className={`roster-simple-cell roster-live-cell${cellAssignments.length === 0 ? " roster-simple-empty" : ""}${cellBackups.length ? " has-backup" : ""}`} aria-pressed={selected} aria-label={`${employee.name}, ${day.getDate()} ${monthNames[day.getMonth()]}, ${cellAssignments.length} penugasan${cellBackups.length ? ", menjalankan backup" : ""}`} title={cellBackups.length ? `Backup ${employees.find((item) => item.id === cellBackups[0]!.coveredEmployeeId)?.name ?? "karyawan"}` : undefined} onClick={() => selectCell(key)}>
                            {cellAssignments.length === 0 ? "+" : cellAssignments.slice(0, 2).map((assignment) => <span className={`roster-live-code ${assignmentClass(assignment)}`} key={assignment.id}>{assignmentLabel(assignment)}</span>)}
                            {cellBackups.length ? <span className="roster-backup-code">BK</span> : null}
                            {cellAssignments.length > 2 ? <small>+{cellAssignments.length - 2}</small> : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>
        ) : null}

        <footer className="roster-simple-footer">
          <div className="roster-color-legend" aria-label="Keterangan warna jadwal">
            <strong>Keterangan warna</strong>
            <span className="legend-morning"><i aria-hidden="true" />Pagi</span>
            <span className="legend-night"><i aria-hidden="true" />Malam</span>
            <span className="legend-steady"><i aria-hidden="true" />Steady Day</span>
            <span className="legend-drill"><i aria-hidden="true" />Drill</span>
            <span className="legend-mcr"><i aria-hidden="true" />MCR</span>
            <span className="legend-admin"><i aria-hidden="true" />ADM</span>
            <span className="legend-off"><i aria-hidden="true" />Off</span>
            <span className="legend-leave"><i aria-hidden="true" />Cuti</span>
            <span className="legend-overtime"><i aria-hidden="true" />Lembur</span>
          </div>
          <div className="roster-result-summary" aria-label="Ringkasan kalender"><span><b>{displayGroups.length}</b> kelompok kerja</span><span><b>{detailedEmployees.length}</b> rincian karyawan</span><span><b>{assignments.length}</b> jadwal aktif</span></div>
        </footer>
      </section>

      {editorKeys.length > 0 && typeof document !== "undefined" ? createPortal(
        <div className="roster-modal-backdrop" role="presentation" onMouseDown={closeEditor}>
          <aside className="roster-preview-editor roster-simple-editor roster-modal roster-live-editor" role="dialog" aria-modal="true" aria-label="Atur jadwal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="roster-preview-editor-header"><div><h2>{bulkEditor ? "Atur jadwal massal" : "Atur jadwal"}</h2><p>{bulkEditor ? `${editorKeys.length} sel kalender dipilih` : `${editorEmployee?.name ?? "Karyawan"} | ${firstEditorCell?.date ?? ""}`}</p></div><button type="button" aria-label="Tutup editor" onClick={closeEditor}>×</button></div>

            {!bulkEditor && existingEditorAssignments.length > 0 ? <div className="roster-editor-existing"><strong>Jadwal pada tanggal ini</strong>{existingEditorAssignments.map((assignment) => <div key={assignment.id}><span><b>{assignmentLabel(assignment)}</b>{assignment.startTime ? <small>{assignment.startTime}-{assignment.endTime}</small> : null}</span><button type="button" disabled={saving} onClick={() => void removeAssignment(assignment)}>Hapus</button></div>)}</div> : null}

            <div className="roster-editor-field"><span>Jenis penugasan</span><CustomSelect ariaLabel="Jenis penugasan" value={draftType} options={assignmentOptions} onChange={(value) => { const next = value as AssignmentType; setDraftType(next); if (next === "OFF" || next === "LEAVE") setDraftTemplateId(""); }} /></div>
            <div className="roster-editor-field"><span>Template jam</span><CustomSelect ariaLabel="Template jam" value={draftTemplateId} options={templateOptions} disabled={draftType === "OFF" || draftType === "LEAVE"} onChange={setDraftTemplateId} /></div>
            <label><span>Keterangan</span><input type="text" value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} maxLength={1000} placeholder="Opsional" /></label>
            <p className="roster-editor-help">Jika jenis yang sama sudah ada, data lama akan diperbarui. Jenis berbeda menjadi lapisan tambahan pada tanggal tersebut.</p>
            <div className="roster-preview-editor-actions"><button className="roster-preview-secondary" type="button" disabled={saving} onClick={() => void clearEditorCells()}>Hapus semua</button><button className="roster-preview-primary" type="button" disabled={saving} onClick={() => void saveAssignments()}>{saving ? "Menyimpan..." : "Simpan"}</button></div>
          </aside>
        </div>,
        document.body
      ) : null}
      {backupEditorOpen && typeof document !== "undefined" ? createPortal(
        <div className="roster-modal-backdrop" role="presentation" onMouseDown={() => setBackupEditorOpen(false)}>
          <aside
            className="roster-backup-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Atur backup"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="roster-backup-modal-header">
              <div>
                <span className="roster-backup-eyebrow">PENGATURAN ROSTER</span>
                <h2>Atur Jadwal Backup</h2>
                <p>Catat penggantian shift karyawan tanpa mengubah jadwal asli.</p>
              </div>
              <button
                type="button"
                className="roster-backup-close-btn"
                aria-label="Tutup editor backup"
                onClick={() => setBackupEditorOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="roster-backup-modal-body">
              <div className="roster-backup-field">
                <span className="field-title">Karyawan yang Digantikan</span>
                <SearchableSelect
                  ariaLabel="Pilih karyawan yang digantikan"
                  value={backupCoveredId}
                  options={employees.map((emp) => ({
                    value: String(emp.id),
                    label: emp.name,
                    subLabel: `NIK: ${emp.employeeCode} · ${emp.departmentName ?? "Departemen belum diatur"}`
                  }))}
                  placeholder="Pilih karyawan yang digantikan..."
                  searchPlaceholder="Ketik nama atau NIK karyawan..."
                  onChange={(val) => setBackupCoveredId(val)}
                />
              </div>

              <div className="roster-backup-field">
                <span className="field-title">Karyawan Backup (Pengganti)</span>
                <SearchableSelect
                  ariaLabel="Pilih karyawan backup"
                  value={backupEmployeeId}
                  options={employees
                    .filter((emp) => String(emp.id) !== backupCoveredId)
                    .map((emp) => ({
                      value: String(emp.id),
                      label: emp.name,
                      subLabel: `NIK: ${emp.employeeCode} · ${emp.departmentName ?? "Departemen belum diatur"}`
                    }))}
                  placeholder="Pilih karyawan pengganti..."
                  searchPlaceholder="Ketik nama atau NIK karyawan pengganti..."
                  onChange={(val) => setBackupEmployeeId(val)}
                />
              </div>

              <div className="roster-backup-dates-grid">
                <label className="roster-backup-field">
                  <span className="field-title">Tanggal Mulai</span>
                  <input
                    type="date"
                    value={backupStartDate}
                    min={from}
                    max={to}
                    onChange={(event) => setBackupStartDate(event.target.value)}
                    required
                  />
                </label>
                <label className="roster-backup-field">
                  <span className="field-title">Tanggal Selesai</span>
                  <input
                    type="date"
                    value={backupEndDate}
                    min={from}
                    max={to}
                    onChange={(event) => setBackupEndDate(event.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="roster-backup-field">
                <span className="field-title">Alasan Penggantian</span>
                <CustomSelect
                  ariaLabel="Pilih alasan backup"
                  value={backupReason}
                  options={backupReasonOptions}
                  onChange={(value) => setBackupReason(value as BackupReason)}
                />
              </div>

              {backupReason === "OTHER" ? (
                <label className="roster-backup-field">
                  <span className="field-title">Jelaskan Alasan Lainnya</span>
                  <input
                    type="text"
                    value={backupReasonDetails}
                    onChange={(event) => setBackupReasonDetails(event.target.value)}
                    maxLength={500}
                    placeholder="Contoh: tugas luar mendadak"
                  />
                </label>
              ) : null}

              <label className="roster-backup-field">
                <span className="field-title">Catatan Tambahan (Opsional)</span>
                <input
                  type="text"
                  value={backupNotes}
                  onChange={(event) => setBackupNotes(event.target.value)}
                  maxLength={1000}
                  placeholder="Keterangan tambahan shift..."
                />
              </label>
            </div>

            <div className="roster-backup-modal-footer">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setBackupEditorOpen(false)}
                disabled={saving}
              >
                Batal
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => void saveBackup()}
                disabled={saving || !backupCoveredId || !backupEmployeeId}
              >
                {saving ? "Menyimpan..." : "Simpan Jadwal Backup"}
              </button>
            </div>
          </aside>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
