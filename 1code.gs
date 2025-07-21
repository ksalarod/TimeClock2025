function doGet() {
const template = HtmlService.createTemplateFromFile("form");
return template.evaluate()
.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
.setTitle("Clock In / Out");
}

function processSubmission(data) {
const ss = SpreadsheetApp.getActiveSpreadsheet();
const pinSheet = ss.getSheetByName("PINDirectory");
const formSheet = ss.getSheetByName("PunchData");

const rawName = data.name.trim();
const pin = data.pin.trim();
const action = data.action;
const formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();

const pinList = pinSheet.getRange(2, 1, pinSheet.getLastRow() - 1, 2).getValues();

const valid = pinList.some(entry =>
entry[0].toLowerCase().trim() === rawName.toLowerCase() &&
String(entry[1]) === pin
);

if (!valid) {
return {
success: false,
message: "❌ Invalid PIN. Please see your supervisor."
};
}

const timestamp = new Date();
const confirmationCode = Math.floor(100000 + Math.random() * 900000);

formSheet.appendRow([timestamp, formattedName, action, pin, confirmationCode]);

return {
success: true,
message: `✅ Hello ${formattedName}, your ${action.toLowerCase()} has been recorded.`,
code: confirmationCode
};
}

function generateTimesheetSummary() {
const ss = SpreadsheetApp.getActiveSpreadsheet();
const dataSheet = ss.getSheetByName('PunchData');
const summarySheetName = 'TimesheetSummary';
let summarySheet = ss.getSheetByName(summarySheetName);

if (!summarySheet) {
summarySheet = ss.insertSheet(summarySheetName);
} else {
summarySheet.clear();
}

summarySheet.appendRow([
'Name', 'Week Of', 'Total Hours', 'Lunch Time', 'Notes'
]);

const rows = dataSheet.getDataRange().getValues();
const header = rows.shift();

const timeLog = {};

for (let row of rows) {
const [timestamp, name, action, pin, code] = row;
if (!(timestamp instanceof Date)) continue;

const weekStart = getWeekStart(timestamp);
const key = `${name}-${weekStart.toDateString()}`;

if (!timeLog[key]) {
timeLog[key] = {
name,
weekStart,
punches: []
};
}

timeLog[key].punches.push({ timestamp, action });
}

for (let key in timeLog) {
const { name, weekStart, punches } = timeLog[key];
punches.sort((a, b) => a.timestamp - b.timestamp);

let clockIn, lunchStart, lunchEnd, clockOut;
let notes = [];

for (let p of punches) {
const action = p.action.toLowerCase();
if (action.includes('clock in') || action.includes('entrada')) clockIn = p.timestamp;
if (action.includes('start lunch') || action.includes('inicio')) lunchStart = p.timestamp;
if (action.includes('end lunch') || action.includes('fin')) lunchEnd = p.timestamp;
if (action.includes('clock out') || action.includes('salida')) clockOut = p.timestamp;
}

let totalHours = 0;
let lunchMinutes = 0;

if (clockIn && clockOut) {
const total = (clockOut - clockIn) / (1000 * 60 * 60);
totalHours = Math.round(total * 100) / 100;
} else {
notes.push("Missed punch / Registro faltante");
}

if (lunchStart && lunchEnd) {
lunchMinutes = (lunchEnd - lunchStart) / (1000 * 60);
if (lunchMinutes > 40) {
notes.push("Lunch too long / Almuerzo demasiado largo");
}
} else {
notes.push("Lunch punch missing / Faltante de almuerzo");
}

summarySheet.appendRow([
name,
weekStart.toLocaleDateString(),
totalHours,
Math.round(lunchMinutes),
notes.join('; ')
]);
}
}

function getWeekStart(date) {
const d = new Date(date);
const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
return new Date(d.setDate(diff));
}
