function doGet() {
const template = HtmlService.createTemplateFromFile("form");
return template.evaluate()
.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
.setTitle("Clock In / Out");
}

function processSubmission(data) {
const ss = SpreadsheetApp.getActiveSpreadsheet();
const pinSheet = ss.getSheetByName('PINDirectory');
const formSheet = ss.getSheetByName('PunchData');

const name = data.name.trim().toLowerCase();
const pin = data.pin.trim();
const action = data.action;

const pinList = pinSheet.getRange(2, 1, pinSheet.getLastRow() - 1, 2).getValues();
const valid = pinList.some(entry =>
entry[0].toLowerCase() === name && String(entry[1]) === pin
);

if (!valid) {
return {
success: false,
message: "❌ Invalid PIN. Please see your supervisor. / PIN inválido. Por favor consulte con su supervisor."
};
}

const dataRows = formSheet.getDataRange().getValues();
const userPunches = dataRows.filter(row => row[1].toLowerCase() === name);
const lastAction = userPunches.length > 0 ? userPunches[userPunches.length - 1][2] : null;

if (action === "Clock In" && lastAction && lastAction !== "Clock Out") {
return {
success: false,
message: "❌ You must clock out before clocking in again. / Debe registrar su salida antes de volver a registrar su entrada."
};
}

if (action === "Start Lunch" && lastAction !== "Clock In") {
return {
success: false,
message: "❌ You must clock in before starting lunch. / Debe registrar su entrada antes de iniciar el almuerzo."
};
}

if (action === "End Lunch" && lastAction !== "Start Lunch") {
return {
success: false,
message: "❌ You must start lunch before ending it. / Debe iniciar el almuerzo antes de terminarlo."
};
}

if (action === "Clock Out" && !["Clock In", "End Lunch"].includes(lastAction)) {
return {
success: false,
message: "❌ You must clock in before clocking out. / Debe registrar su entrada antes de salir."
};
}

const timestamp = new Date();
const confirmationCode = Math.floor(100000 + Math.random() * 900000);

formSheet.appendRow([timestamp, data.name, action, pin, confirmationCode]);

const lastRow = formSheet.getLastRow();
formSheet.getRange(`A${lastRow}`).setNumberFormat("MM/dd/yyyy hh:mm:ss AM/PM");

return {
success: true,
message: `✅ Hello ${data.name}, your ${action.toLowerCase()} has been recorded.`,
code: confirmationCode
};
}

function generateTimesheetSummary() {
const ss = SpreadsheetApp.getActiveSpreadsheet();
const dataSheet = ss.getSheetByName("PunchData");
const summarySheet = ss.getSheetByName("TimesheetSummary") || ss.insertSheet("TimesheetSummary");

const data = dataSheet.getDataRange().getValues();
const headers = data[0];
const rows = data.slice(1);

const timestampIdx = headers.indexOf("Timestamp");
const nameIdx = headers.indexOf("Name");
const actionIdx = headers.indexOf("Action");

const grouped = {};

rows.forEach(row => {
const timestamp = new Date(row[timestampIdx]);
const name = row[nameIdx].toLowerCase().trim();
const action = row[actionIdx];
const dateKey = Utilities.formatDate(timestamp, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
const weekStart = getWeekStart(timestamp);

if (!grouped[name]) grouped[name] = {};
if (!grouped[name][weekStart]) grouped[name][weekStart] = {};
if (!grouped[name][weekStart][dateKey]) grouped[name][weekStart][dateKey] = [];

grouped[name][weekStart][dateKey].push({ action, time: timestamp });
});

const output = [["Name", "Week Starting", "Total Hours", "Flags", "Notes"]];

for (const name in grouped) {
for (const weekStart in grouped[name]) {
let totalMs = 0;
let flags = [];
let notes = [];

for (const date in grouped[name][weekStart]) {
const punches = grouped[name][weekStart][date];
punches.sort((a, b) => a.time - b.time);

const times = {
"Clock In": null,
"Start Lunch": null,
"End Lunch": null,
"Clock Out": null,
};

punches.forEach(p => {
if (times[p.action] === null) {
times[p.action] = p.time;
}
});

for (const key in times) {
if (!times[key]) {
flags.push(`Missed ${key} on ${date}`);
}
}

if (times["Clock In"] && times["Clock Out"]) {
let workMs = times["Clock Out"] - times["Clock In"];
let lunchMs = 0;

if (times["Start Lunch"] && times["End Lunch"]) {
lunchMs = times["End Lunch"] - times["Start Lunch"];
if (lunchMs > 35 * 60 * 1000) {
flags.push(`Long lunch on ${date}`);
notes.push(`Lunch was ${Math.round(lunchMs / 60000)} min`);
}
}

const netMs = workMs - lunchMs;
if (netMs > 0) totalMs += netMs;
}
}

const totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;
output.push([
capitalize(name),
weekStart,
totalHours,
flags.length ? flags.join(", ") : "✅",
notes.join(" / ")
]);
}
}

summarySheet.clearContents();
summarySheet.getRange(1, 1, output.length, output[0].length).setValues(output);
}

function resendTimesheetSummary() {
generateTimesheetSummary();
sendWeeklyTimesheetEmail();
SpreadsheetApp.getUi().alert("📩 Timesheet report has been re-sent to your email.");
}

function emailWeeklyReport() {
const ss = SpreadsheetApp.getActiveSpreadsheet();
const sheet = ss.getSheetByName("TimesheetSummary");
const range = sheet.getDataRange();
const values = range.getValues();
const email = Session.getActiveUser().getEmail();

if (values.length <= 1) {
Logger.log("No data to email.");
return;
}

let csvContent = values.map(row =>
row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
).join("\n");

const blob = Utilities.newBlob(csvContent, "text/csv", "TimesheetSummary.csv");

MailApp.sendEmail({
to: email,
subject: `Weekly Timesheet Summary - ${new Date().toLocaleDateString()}`,
body: "Attached is the weekly summary for your review.",
attachments: [blob]
});

Logger.log("CSV report emailed to: " + email);
}

function sendWeeklyTimesheetEmail() {
const ss = SpreadsheetApp.getActiveSpreadsheet();
const sheet = ss.getSheetByName("TimesheetSummary");
const data = sheet.getDataRange().getValues();

if (data.length < 2) {
Logger.log("No data to send.");
return;
}

const csvContent = data.map(row => row.join(",")).join("\n");
const blob = Utilities.newBlob(csvContent, 'text/csv', 'TimesheetSummary.csv');

MailApp.sendEmail({
to: Session.getActiveUser().getEmail(),
subject: "📊 Weekly Timesheet Summary",
body: "Hi,\n\nAttached is your weekly timesheet summary.\n\n— Timekeeper Bot",
attachments: [blob]
});
}

function getWeekStart(date) {
const d = new Date(date);
const day = d.getDay();
const diff = d.getDate() - day + (day === 0 ? -6 : 1);
const monday = new Date(d.setDate(diff));
return Utilities.formatDate(monday, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), "yyyy-MM-dd");
}

function capitalize(str) {
return str.charAt(0).toUpperCase() + str.slice(1);
}
