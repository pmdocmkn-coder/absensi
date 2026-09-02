param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][datetime]$From,
  [Parameter(Mandatory = $true)][datetime]$To
)

$ErrorActionPreference = "Stop"
$connection = New-Object -ComObject ADODB.Connection
$connection.Open("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$InputPath;Mode=Read;")

$fromLiteral = $From.ToString("MM/dd/yyyy HH:mm:ss", [Globalization.CultureInfo]::InvariantCulture)
$toLiteral = $To.ToString("MM/dd/yyyy HH:mm:ss", [Globalization.CultureInfo]::InvariantCulture)
$sql = @"
SELECT
  c.USERID,
  u.Badgenumber,
  u.Name,
  c.CHECKTIME,
  c.CHECKTYPE,
  c.VERIFYCODE,
  c.SENSORID,
  c.WorkCode,
  c.sn
FROM CHECKINOUT AS c
LEFT JOIN USERINFO AS u ON u.USERID = c.USERID
WHERE c.CHECKTIME >= #$fromLiteral# AND c.CHECKTIME < #$toLiteral#
ORDER BY c.CHECKTIME
"@

$recordset = New-Object -ComObject ADODB.Recordset
$recordset.Open($sql, $connection)
$utf8WithoutBom = New-Object Text.UTF8Encoding($false)
$writer = New-Object IO.StreamWriter($OutputPath, $false, $utf8WithoutBom)

try {
  while (-not $recordset.EOF) {
    $employeeCode = $recordset.Fields.Item("Badgenumber").Value
    if (-not $employeeCode) { $employeeCode = $recordset.Fields.Item("USERID").Value }
    $row = [ordered]@{
      employeeCode = [string]$employeeCode
      employeeName = [string]$recordset.Fields.Item("Name").Value
      recordedAt = ([datetime]$recordset.Fields.Item("CHECKTIME").Value).ToString("yyyy-MM-dd HH:mm:ss")
      attendanceStatus = $recordset.Fields.Item("CHECKTYPE").Value
      verificationType = $recordset.Fields.Item("VERIFYCODE").Value
      sensorId = [string]$recordset.Fields.Item("SENSORID").Value
      workCode = [string]$recordset.Fields.Item("WorkCode").Value
      deviceSerial = [string]$recordset.Fields.Item("sn").Value
    }
    $writer.WriteLine(($row | ConvertTo-Json -Compress))
    $recordset.MoveNext()
  }
}
finally {
  $writer.Close()
  $recordset.Close()
  $connection.Close()
}
