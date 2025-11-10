# Bob Field Updater

Google Apps Script automation for updating employee fields in Bob (HiBob) HR platform.

## Features

### 1. Field Uploader
- **Update Single Field for Multiple Employees**: Batch update a specific field across multiple employees
- **Field Selection**: Search and select from 38,000+ available fields with real-time filtering
- **Data Validation**: Validate upload data before submitting
- **Batch Updates**: Efficiently update multiple employees in one operation

### 2. Salary Data Management
- Import Base Data, Bonus History, Compensation History
- Automatic tenure calculations
- Data normalization and formatting

### 3. Performance Report Automation
- Web interface for downloading performance reports
- Credentials management
- Automated upload to Google Sheets

## Setup

### Prerequisites
1. Google Apps Script project with clasp configured
2. Bob API credentials (BOB_ID, BOB_KEY) in Script Properties
3. Google Sheets API access

### Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd "Bob - Field_Updater"
```

2. Install clasp (if not already installed):
```bash
npm install -g @google/clasp
```

3. Login to clasp:
```bash
clasp login
```

4. Link to your Apps Script project:
```bash
clasp clone <script-id>
```

Or update `.clasp.json` with your script ID.

5. Set Bob API credentials in Apps Script:
   - Go to Apps Script project settings
   - Add Script Properties:
     - `BOB_ID`: Your Bob API ID
     - `BOB_KEY`: Your Bob API Key

## Usage

### Field Uploader

1. **Setup**:
   - Run `SETUP -> 1. Pull Fields` to fetch all available fields
   - Run `SETUP -> 4. Setup Field Uploader` to create the uploader sheet
   - Run `SETUP -> 5. Select Field to Update` to choose which field to update

2. **Prepare Data**:
   - Open the "Uploader" sheet
   - Paste employee CIQ IDs in column A (starting row 8)
   - Enter new values in column B

3. **Validate**:
   - Run `VALIDATE -> Validate Field Upload Data` to check for errors

4. **Upload**:
   - Run `UPLOAD -> Upload Field Updates` to apply changes

### Menu Structure

```
🤖 Bob Automation
├── Salary Data
│   ├── Import Base Data
│   ├── Import Bonus History
│   ├── Import Compensation History
│   ├── Import Full Comp History
│   └── Import All Data
├── Performance Reports
│   ├── Launch Web Interface
│   ├── Set HiBob Credentials
│   └── View Credentials Status
└── Field Uploader
    ├── SETUP
    │   ├── 1. Pull Fields
    │   ├── 2. Pull Lists
    │   ├── 3. Pull Employees
    │   ├── >> Refresh Employees (Keep Filters)
    │   ├── 4. Setup Field Uploader
    │   └── 5. Select Field to Update
    ├── VALIDATE
    │   └── Validate Field Upload Data
    └── UPLOAD
        └── Upload Field Updates
```

## Deployment

### Push to Apps Script

```bash
clasp push
```

### Deploy as Web App

1. In Apps Script editor, go to Deploy > New deployment
2. Select type: Web app
3. Configure:
   - Execute as: Me
   - Who has access: Domain or Anyone
4. Deploy and copy the web app URL

## API Endpoints

### GET `/exec?action=getCredentials`
Returns stored HiBob credentials (for Python automation).

### POST `/exec`
Accepts JSON data for importing to Google Sheets:
```json
{
  "data": [[...rows...]],
  "sheet_name": "Sheet Name",
  "filename": "report.xlsx"
}
```

## File Structure

```
Bob - Field_Updater/
├── bob-consolidated.gs    # Main Apps Script file
├── appsscript.json        # Apps Script configuration
├── .clasp.json           # Clasp configuration
└── README.md              # This file
```

## Troubleshooting

### Search Not Working
- Ensure you've run `SETUP -> 1. Pull Fields` first
- Check that the "Bob Fields Meta Data" sheet exists and has data
- Refresh the page and try again

### Upload Fails
- Verify Bob API credentials are set correctly
- Check that CIQ IDs are valid
- Ensure the selected field exists and is writable
- Review error messages in the Apps Script execution log

### Field Selection Modal Not Appearing
- Check browser console for JavaScript errors
- Ensure you have edit access to the spreadsheet
- Try refreshing the page

## Version

2.0.0

## License

Proprietary - Internal Use Only

