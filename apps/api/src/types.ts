export type DeviceEvent = {
  id: string;
  receivedAt: string;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  deviceSerial: string | null;
  employeeCode: string | null;
  employeeName?: string | null;
  recordedAt: string | null;
  attendanceStatus: number | null;
  verificationType: number | null;
  source: "x105" | "simulator" | "unknown";
};
