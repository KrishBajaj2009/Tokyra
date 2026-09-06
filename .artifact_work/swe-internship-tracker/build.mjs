import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/krishbajaj/Documents/New project/outputs/01a0720f-acab-7780-9a19-4a4c286b519f";
const outputPath = `${outputDir}/Krish_Bajaj_SWE_Internship_Tracker.xlsx`;
const font = "Arial";
const navy = "#17365D";
const blue = "#DCE6F1";
const paleBlue = "#EEF4FA";
const amber = "#FFF2CC";
const lightGray = "#F3F5F7";
const text = "#1F2937";
const grid = "#D9E2F3";

const wb = Workbook.create();
const profile = wb.worksheets.add("Profile & plan");
const applications = wb.worksheets.add("Applications");
const sources = wb.worksheets.add("Sources");

for (const sheet of [profile, applications, sources]) {
  sheet.showGridLines = false;
  sheet.tabColor = navy;
}

// Profile & plan
profile.getRange("A1").values = [["2027 SWE internship tracker"]];
profile.getRange("A2").values = [["Krish Bajaj · High-school senior · Updated 2026-09-05"]];
profile.getRange("A1:J1").format = { font: { name: font, size: 18, bold: true, color: navy }, verticalAlignment: "center" };
profile.getRange("A2:J2").format = { font: { name: font, size: 10, italic: true, color: "#52616B" } };
profile.getRange("A3:J3").format.borders = { bottom: { style: "medium", color: navy } };

profile.getRange("A5:J5").values = [["Profile", "", "", "Application progress", "", "", "", "", "", ""]];
profile.getRange("A5:J5").format = { fill: blue, font: { name: font, bold: true, color: navy }, verticalAlignment: "center" };
profile.getRange("A6:B11").values = [
  ["Target roles", "Software engineering, robotics, computer vision, automation"],
  ["Timeframe", "Summer 2027 and early-college opportunities"],
  ["Preferred scope", "Central Florida, hybrid/remote, or relocation with support"],
  ["Education", "IB high-school senior · Expected 2027 · Weighted GPA 4.623 · SAT 1450"],
  ["Technical skills", "Java, Python, C++, JavaScript, React, Node.js, Git, Unity"],
  ["Best evidence", "FTC lead programmer; UCF CS research; web-development team lead"],
];
profile.getRange("A6:A11").format = { fill: lightGray, font: { name: font, bold: true, color: text }, verticalAlignment: "top" };
profile.getRange("B6:B11").format = { font: { name: font, color: text }, wrapText: true, verticalAlignment: "top" };

profile.getRange("D6:E8").values = [
  ["Applied", null],
  ["Ready to apply", null],
  ["Upcoming deadlines", null],
];
profile.getRange("E6").formulas = [["=COUNTIF('Applications'!$H$6:$H$30,\"Applied\")"]];
profile.getRange("E7").formulas = [["=COUNTIF('Applications'!$H$6:$H$30,\"Ready to apply\")"]];
profile.getRange("E8").formulas = [["=COUNTIF('Applications'!$K$6:$K$30,\">0\")"]];
profile.getRange("D6:D8").format = { fill: lightGray, font: { name: font, bold: true, color: text } };
profile.getRange("E6:E8").format = { fill: paleBlue, font: { name: font, size: 13, bold: true, color: navy }, horizontalAlignment: "center" };

profile.getRange("A14").values = [["Priority actions"]];
profile.getRange("A14:J14").format = { fill: blue, font: { name: font, bold: true, color: navy } };
profile.getRange("A15:C18").values = [
  ["1", "Apply to SEAP", "Use FTC autonomy, computer vision, and UCF research to target software/robotics projects."],
  ["2", "Ask UCF research lead", "Request a 20-minute conversation about a paid or credit-bearing summer research extension and Python/Unity tasks."],
  ["3", "Reconnect with Edge Systems", "Ask whether the web-development team needs a part-time or summer software contributor."],
  ["4", "Prepare application packet", "Keep an updated one-page résumé, unofficial transcript, two recommenders, and a short technical-project summary ready."],
];
profile.getRange("A15:A18").format = { fill: navy, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
profile.getRange("B15:B18").format = { font: { name: font, bold: true, color: text }, verticalAlignment: "top" };
profile.getRange("C15:C18").format = { font: { name: font, color: text }, wrapText: true, verticalAlignment: "top" };
profile.getRange("A15:C18").format.borders = { preset: "outside", style: "thin", color: grid };

profile.getRange("A21").values = [["Positioning for applications"]];
profile.getRange("A21:J21").format = { fill: blue, font: { name: font, bold: true, color: navy } };
profile.getRange("A22:B24").values = [
  ["Robotics software", "Lead programmer for FTC Team 16290; built Bezier-curve autonomous paths, vision, and automation."],
  ["Research readiness", "UCF Computer Science research assistant exploring computer vision, automation, HRI, XR, Unity, and additional stacks."],
  ["Team impact", "Led a five-person web-development team and helped STEM outreach reach 77,000+ people."],
];
profile.getRange("A22:A24").format = { fill: lightGray, font: { name: font, bold: true, color: text }, verticalAlignment: "top" };
profile.getRange("B22:C24").merge(true);
profile.getRange("B22:C24").format = { font: { name: font, color: text }, wrapText: true, verticalAlignment: "top" };

profile.getRange("A1:J30").format.font = { name: font, size: 10, color: text };
profile.getRange("A1").format.font = { name: font, size: 18, bold: true, color: navy };
profile.getRange("A2").format.font = { name: font, size: 10, italic: true, color: "#52616B" };
for (const [col, width] of [["A", 22], ["B", 48], ["C", 54], ["D", 22], ["E", 16], ["F", 14], ["G", 14], ["H", 14], ["I", 14], ["J", 14]]) profile.getRange(`${col}:${col}`).format.columnWidth = width;
profile.getRange("A15:C24").format.autofitRows();

// Applications
applications.getRange("A1").values = [["Applications"]];
applications.getRange("A2").values = [["Starter list based on your résumé. Confirm current requirements and openings using the linked official source before applying."]];
applications.getRange("A1:M1").format = { font: { name: font, size: 18, bold: true, color: navy } };
applications.getRange("A2:M2").format = { font: { name: font, size: 10, italic: true, color: "#52616B" } };
applications.getRange("A3:M3").format.borders = { bottom: { style: "medium", color: navy } };

const headers = [["Priority", "Program / employer", "Technical focus", "Location / format", "Eligibility fit", "Application route", "Deadline / window", "Status", "Next action", "Deadline date", "Days left", "Notes", "Official source URL"]];
applications.getRange("A5:M5").values = headers;
applications.getRange("A5:M5").format = { fill: navy, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };

const rows = [
  [1, "Navy SEAP", "Software, robotics, data, and lab research", "Florida or another participating Navy lab", "Strong fit", "Official SEAP portal", "Portal expected Sep 2026 for Summer 2027", "Ready to apply", "Create profile; tailor project statement to robotics and vision", null, null, "Paid eight-week high-school research apprenticeship; U.S. citizenship required.", "https://www.onr.navy.mil/education-outreach/k-12-programs/seap"],
  [2, "Navy SEAP — NAWCTSD", "Modeling, simulation, C4ISR, cyber, software", "Orlando, FL", "Strong fit", "Apply through SEAP", "Use SEAP window; confirm local projects", "Ready to apply", "Highlight Central Florida location plus UCF, FTC, and Unity experience", null, null, "NAWCTSD states it mentors high-school SEAP interns and works with UCF.", "https://www.navair.navy.mil/nawctsd/node/216"],
  [3, "NASA OSTEM", "Software, automation, computer vision, mission systems", "Kennedy Space Center / other NASA sites", "Verify before applying", "NASA STEM Gateway", "Spring 2027: 2026-09-14; Summer 2027: 2027-02-26", "Researching", "Check current high-school enrollment rule and filter for Florida software projects", new Date("2026-09-14"), null, "Current NASA pages list scheduled 2027 deadlines; eligibility guidance varies by page, so confirm in the application portal.", "https://www.nasa.gov/learning-resources/internship-programs/"],
  [4, "NASA SACD internship / volunteer", "Earth science data, software, automation", "NASA centers; project-dependent", "Verify before applying", "NASA SACD opportunities", "Project-dependent", "Researching", "Look for high-school project descriptions and ask whether software/data work is available", null, null, "NASA SACD states paid internships and volunteer roles can be available to high-school students.", "https://www.nasa.gov/sacd-internships/"],
  [5, "NIH Summer Internship Program", "Research informatics, imaging, data tools", "NIH campuses", "Conditional fit", "NIH SIP application", "2027 dates not posted", "Researching", "Review age, graduation, citizenship, and campus-distance requirements", null, null, "Relevant for imaging/data, but high-school participation has age and location conditions.", "https://www.niehs.nih.gov/careers/research/summers/require"],
  [6, "NSA High School Work Study", "Computer / engineering technology", "NSA sites; location-limited", "Low fit unless near a site", "NSA job board", "Applications begin Sep 1", "Researching", "Check school-sponsored work-experience and site-location requirements", null, null, "For high-school juniors during senior year; includes computer/engineering technology roles at selected sites.", "https://www.nsa.gov/Careers/Student-Programs/"],
  [7, "Microsoft High School Discovery", "Technology project experience", "Redmond, WA or Atlanta, GA", "Low fit due to location", "Microsoft Careers", "Check annual posting", "Researching", "Only pursue if location eligibility changes or a future college program is relevant", null, null, "Four-week program for graduating seniors who live and attend school near Redmond or Atlanta.", "https://careers.microsoft.com/v2/global/en/discoveryprogram"],
  [8, "UCF research extension", "Computer vision, automation, HRI, XR, Unity", "Orlando, FL", "Strong fit", "Direct outreach to current research lead", "Ask this month", "Not started", "Draft a concise email asking about paid summer or project-based work", null, null, "Leverage your current UCF research assistant experience and existing relationship.", ""],
  [9, "Edge Systems follow-on", "Web development, React / Node.js", "Central Florida / project-dependent", "Strong fit", "Direct outreach to former manager", "Ask this month", "Not started", "Share updated résumé and ask about part-time or summer SWE needs", null, null, "Leverage summer 2026 web-development team-lead experience.", ""],
  [10, "FIRST mentor / sponsor referrals", "Robotics software, embedded systems, computer vision", "Central Florida / project-dependent", "Strong fit", "Ask team mentors and sponsors", "Start now", "Not started", "Request introductions to sponsors that hire student interns or project contributors", null, null, "Use two FIRST Championship qualifications and outreach leadership as proof of impact.", ""],
];
applications.getRange("A6:M15").values = rows;
applications.getRange("K6").formulas = [["=IF(J6=\"\",\"\",J6-TODAY())"]];
applications.getRange("K6:K30").fillDown();
applications.getRange("J6:J30").setNumberFormat("yyyy-mm-dd");
applications.getRange("K6:K30").setNumberFormat("#,##0");
applications.getRange("A6:A30").format.horizontalAlignment = "center";
applications.getRange("A6:M30").format.wrapText = true;
applications.getRange("A6:M30").format.verticalAlignment = "top";
applications.getRange("I6:I30").format.fill = amber;
applications.getRange("J6:J30").format.fill = amber;
applications.getRange("H6:H30").dataValidation = { rule: { type: "list", values: ["Not started", "Researching", "Ready to apply", "Applied", "Interviewing", "Closed", "Not eligible"] } };
applications.getRange("E6:E30").dataValidation = { rule: { type: "list", values: ["Strong fit", "Conditional fit", "Verify before applying", "Low fit due to location"] } };
applications.getRange("H6:H30").conditionalFormats.add("containsText", { text: "Applied", format: { fill: "#D9EAD3", font: { color: "#274E13", bold: true } } });
applications.getRange("H6:H30").conditionalFormats.add("containsText", { text: "Ready to apply", format: { fill: "#FFF2CC", font: { color: "#7F6000", bold: true } } });
applications.getRange("H6:H30").conditionalFormats.add("containsText", { text: "Researching", format: { fill: "#D9EAF7", font: { color: navy } } });
applications.getRange("K6:K30").conditionalFormats.add("cellIs", { operator: "between", formula: [0, 14], format: { fill: "#FCE4D6", font: { color: "#9C0006", bold: true } } });
applications.tables.add("A5:M30", true, "ApplicationsTable");
applications.freezePanes.freezeRows(5);

applications.getRange("A1:M30").format.font = { name: font, size: 10, color: text };
applications.getRange("A1").format.font = { name: font, size: 18, bold: true, color: navy };
applications.getRange("A2").format.font = { name: font, size: 10, italic: true, color: "#52616B" };
applications.getRange("A5:M5").format = { fill: navy, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
for (const [col, width] of [["A", 10], ["B", 25], ["C", 31], ["D", 24], ["E", 20], ["F", 22], ["G", 28], ["H", 17], ["I", 37], ["J", 14], ["K", 11], ["L", 40], ["M", 46]]) applications.getRange(`${col}:${col}`).format.columnWidth = width;
applications.getRange("A5:M30").format.autofitRows();
applications.getRange("A5:M5").format.rowHeight = 36;

// Sources
sources.getRange("A1").values = [["Sources"]];
sources.getRange("A2").values = [["Official program pages used to seed the tracker. Requirements and deadlines can change; review the linked page before applying."]];
sources.getRange("A1:D1").format = { font: { name: font, size: 18, bold: true, color: navy } };
sources.getRange("A2:D2").format = { font: { name: font, size: 10, italic: true, color: "#52616B" }, wrapText: true };
sources.getRange("A3:D3").format.borders = { bottom: { style: "medium", color: navy } };
sources.getRange("A5:D5").values = [["Program", "Official source", "What it supports", "Checked"]];
sources.getRange("A5:D5").format = { fill: navy, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
sources.getRange("A6:D12").values = [
  ["Navy SEAP", "https://www.onr.navy.mil/education-outreach/k-12-programs/seap", "High-school STEM apprenticeships; Summer 2027 portal expected in September 2026.", new Date("2026-09-05")],
  ["NAWCTSD", "https://www.navair.navy.mil/nawctsd/node/216", "Orlando-area Navy STEM outreach and SEAP mentoring context.", new Date("2026-09-05")],
  ["NASA internships", "https://www.nasa.gov/learning-resources/internship-programs/", "NASA sessions, deadlines, and current eligibility overview.", new Date("2026-09-05")],
  ["NASA SACD", "https://www.nasa.gov/sacd-internships/", "SACD notes high-school paid internship and volunteer opportunities.", new Date("2026-09-05")],
  ["NIH SIP", "https://www.niehs.nih.gov/careers/research/summers/require", "NIH high-school senior age, graduation, citizenship, and location conditions.", new Date("2026-09-05")],
  ["NSA Student Programs", "https://www.nsa.gov/Careers/Student-Programs/", "High School Work Study locations, scope, and annual application timing.", new Date("2026-09-05")],
  ["Microsoft Discovery", "https://careers.microsoft.com/v2/global/en/discoveryprogram", "Program format and Redmond/Atlanta eligibility.", new Date("2026-09-05")],
];
sources.getRange("D6:D12").setNumberFormat("yyyy-mm-dd");
sources.tables.add("A5:D12", true, "SourcesTable");
sources.getRange("A6:D12").format.wrapText = true;
sources.getRange("A1:D12").format.font = { name: font, size: 10, color: text };
sources.getRange("A1").format.font = { name: font, size: 18, bold: true, color: navy };
sources.getRange("A2").format.font = { name: font, size: 10, italic: true, color: "#52616B" };
sources.getRange("A5:D5").format = { fill: navy, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
for (const [col, width] of [["A", 24], ["B", 68], ["C", 55], ["D", 15]]) sources.getRange(`${col}:${col}`).format.columnWidth = width;
sources.getRange("A5:D12").format.autofitRows();
sources.freezePanes.freezeRows(5);

await fs.mkdir(outputDir, { recursive: true });
const out = await SpreadsheetFile.exportXlsx(wb);
await out.save(outputPath);

const applicationCheck = await wb.inspect({ kind: "table", range: "Applications!A1:M16", include: "values,formulas", tableMaxRows: 16, tableMaxCols: 13 });
console.log(applicationCheck.ndjson);
const profileCheck = await wb.inspect({ kind: "table", range: "Profile & plan!A1:J24", include: "values,formulas", tableMaxRows: 24, tableMaxCols: 10 });
console.log(profileCheck.ndjson);
const errors = await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" });
console.log(errors.ndjson);
for (const [sheetName, range] of [["Profile & plan", "A1:J24"], ["Applications", "A1:M16"], ["Sources", "A1:D12"]]) {
  const image = await wb.render({ sheetName, range, scale: 1.25, format: "png" });
  await fs.writeFile(`${outputDir}/${sheetName.replaceAll(" ", "_")}.png`, new Uint8Array(await image.arrayBuffer()));
}
