# Project Analytics Feature

## Overview

The Project Analytics feature provides comprehensive data visualization and analysis for the Bene fundraising platform. All analytics work **100% client-side** with no backend servers, maintaining the platform's decentralized philosophy.

## Features Implemented

### 1. Data Collection for Key Metrics ✅

**Location:** `src/lib/analytics/analytics-service.ts`

The `AnalyticsService` class collects and calculates:

- **Project Metrics:**
  - Current funding amount and percentage
  - Target and minimum funding goals
  - Net contributions (sold - refunded)
  - Token distribution (sold, unsold, exchanged PFT)
  - Time remaining (days/blocks until deadline)
  - Project status (active, successful, failed)
  - Exchange rates and base token information

- **Platform-Wide Analytics:**
  - Total projects count
  - Active vs ended projects
  - Success rate calculations
  - Total funds raised across all projects
  - Average contribution sizes

### 2. Visualization Components for Funding Progress ✅

**Location:** `src/lib/components/charts/`

Three chart components built with native Canvas API (no external dependencies):

- **PieChart.svelte** - Token distribution visualization
- **LineChart.svelte** - Time-series funding progress
- **BarChart.svelte** - Comparative metrics display

All charts are:
- Responsive and interactive
- Theme-aware
- Optimized for performance
- Accessible with proper labels

### 3. Contributor Analysis Dashboard ✅

**Location:** `src/routes/Analytics.svelte`

The main analytics dashboard provides:

**Platform Overview Mode:**
- Key metrics cards (total projects, active projects, success rate, total contributions)
- Project status distribution pie chart
- Project status comparison bar chart
- Filterable and searchable projects list
- Click any project to drill down into detailed analytics

**Project Detail Mode:**
- Real-time funding progress metrics
- Current vs target funding visualization
- Net contributions tracking
- Token distribution pie chart
- Deadline countdown
- Detailed metrics table with exchange rates, token supply, etc.

### 4. Time-Series Analytics for Trend Analysis ✅

**Implementation:** Client-side data persistence using localStorage

- Automatic data snapshots stored when viewing analytics
- Historical tracking of funding progress over time
- Line chart visualization showing funding trends
- Up to 1000 data points per project retained
- Data persists across browser sessions

**How it works:**
1. Each time you view a project's analytics, a snapshot is taken
2. Snapshots are stored in localStorage with timestamp
3. Time-series charts automatically generate from historical data
4. More data points = better trend visualization

### 5. Exportable Reports Functionality ✅

**Export Options:**

1. **JSON Export:**
   - Platform-wide analytics with all project metrics
   - Individual project analytics with full details
   - Timestamp included for record-keeping

2. **CSV Export:**
   - Time-series data export for spreadsheet analysis
   - Includes: timestamp, block height, funding amounts, contribution counts
   - Compatible with Excel, Google Sheets, etc.

**Export Buttons:**
- Platform overview: "📥 Export Data" (JSON)
- Project details: "📥 Export JSON" and "📊 Export CSV"

## Usage

### Accessing Analytics

1. Navigate to the application
2. Click **"Analytics"** in the main navigation menu
3. View platform overview or select a project for detailed analysis

### Viewing Platform Analytics

The platform overview shows:
- Total number of projects and their statuses
- Overall success rate
- Visual breakdowns of project statuses
- List of all projects with quick stats

### Viewing Project Analytics

1. Click any project from the platform overview
2. View detailed metrics including:
   - Funding progress and goals
   - Token distribution
   - Time remaining
   - Historical funding trends (if data available)
3. Export data using the export buttons

### Exporting Data

**For Platform Data:**
```
Platform Overview → "📥 Export Data" button
```
Downloads: `platform-analytics-[timestamp].json`

**For Project Data:**
```
Project Details → "📥 Export JSON" button
```
Downloads: `project-analytics-[projectId]-[timestamp].json`

**For Time-Series Data:**
```
Project Details → "📊 Export CSV" button (if historical data exists)
```
Downloads: `timeseries-[projectId]-[timestamp].csv`

## Technical Architecture

### Client-Side Storage

All data is stored in browser localStorage:
- Key format: `analytics_[projectId]`
- Data includes timestamp and full metrics
- Automatic cleanup (max 1000 snapshots per project)
- Cross-session persistence

### Static Page Compatibility

The analytics feature is fully compatible with static page deployment:

✅ **No Backend Required**
- All calculations done in browser
- No API calls to analytics servers
- No database dependencies

✅ **Local Data Storage**
- localStorage for persistence
- IndexedDB could be added if needed
- User data never leaves their browser

✅ **Export Without Server**
- Blob URLs for downloads
- No server-side file generation
- Works offline after page load

### Performance Optimizations

- **Lazy loading:** Analytics only loads when tab is active
- **Efficient calculations:** Metrics computed on-demand
- **Canvas rendering:** Native browser APIs, no heavy libraries
- **Data limits:** Automatic cleanup of old snapshots

## File Structure

```
src/
├── lib/
│   ├── analytics/
│   │   └── analytics-service.ts       # Core analytics logic
│   └── components/
│       └── charts/
│           ├── PieChart.svelte        # Pie chart component
│           ├── LineChart.svelte       # Line/trend chart
│           └── BarChart.svelte        # Bar chart component
└── routes/
    ├── Analytics.svelte               # Main analytics dashboard
    └── App.svelte                     # Updated with analytics nav
```

## Future Enhancements

Potential additions that maintain static-page compatibility:

1. **Advanced Filters:**
   - Filter by funding status
   - Date range selection
   - Token type filtering

2. **More Visualizations:**
   - Heatmaps for contribution patterns
   - Funnel charts for conversion rates
   - Scatter plots for project comparisons

3. **Comparative Analytics:**
   - Compare multiple projects side-by-side
   - Benchmark against platform averages
   - Success prediction indicators

4. **Data Insights:**
   - Automated trend detection
   - Anomaly detection in contributions
   - Success factor analysis

5. **Share Reports:**
   - Generate shareable report links (data in URL)
   - PDF export (client-side generation)
   - Screenshot/image export

## Browser Compatibility

Tested and working in:
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Brave (latest)

Requires:
- Canvas API support
- localStorage support
- ES6+ JavaScript support

## Contributing

When adding new analytics features:

1. Maintain client-side only approach
2. Use localStorage for persistence
3. Keep data export formats (JSON/CSV)
4. Document new metrics in this README
5. Ensure static page compatibility

## License

Part of the Bene Fundraising Platform
Licensed under the same terms as the main project

---

**Built with ❤️ for the Ergo community**
