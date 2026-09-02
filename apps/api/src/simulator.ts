const apiUrl = Bun.env.API_URL ?? "http://localhost:8080";
const employeeCode = process.argv[2] ?? "1001";
const now = new Date();
const pad = (value: number) => String(value).padStart(2, "0");
const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
const payload = `${employeeCode}\t${timestamp}\t1\t0\t0\t0`;

const response = await fetch(`${apiUrl}/iclock/cdata?SN=SIMULATOR-X105&table=ATTLOG`, {
  method: "POST",
  headers: {
    "content-type": "text/plain",
    "x-attendance-simulator": "1"
  },
  body: payload
});

console.log(`Sent ${response.status}: ${await response.text()}`);

export {};
