# Quick Start Guide - Analytics Feature

## For Developers

### Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Accessing Analytics

1. Open the application (http://localhost:5173)
2. Click **"Analytics"** in the navigation bar
3. Explore platform statistics or dive into individual projects

## For Users

### Viewing Analytics

**Platform Overview:**
- See total projects, success rates, and platform statistics
- View visual breakdowns of project statuses
- Browse all projects with quick stats

**Project Details:**
- Click any project to see detailed analytics
- View funding progress, token distribution
- Track time remaining until deadline
- See historical trends (after multiple views)

### Exporting Data

**Export Platform Data (JSON):**
1. Stay on platform overview page
2. Click "📥 Export Data" button
3. File downloads as `platform-analytics-[timestamp].json`

**Export Project Data (JSON):**
1. Navigate to a project's details
2. Click "📥 Export JSON" button
3. File downloads as `project-analytics-[projectId]-[timestamp].json`

**Export Time-Series Data (CSV):**
1. Navigate to a project's details (must have viewed before for historical data)
2. Click "📊 Export CSV" button
3. File downloads as `timeseries-[projectId]-[timestamp].csv`
4. Open in Excel, Google Sheets, or any spreadsheet software

### Understanding the Data

**Project Metrics:**
- **Current Funding:** Amount raised so far
- **Target Funding:** Maximum fundraising goal
- **Minimum Funding:** Threshold for success
- **Net Contributions:** Total sold minus refunds
- **Funding Percentage:** Progress toward target

**Project Status:**
- 🟢 **Active:** Campaign is ongoing
- ✅ **Successful:** Reached minimum goal and ended
- ❌ **Failed:** Did not reach goal and ended

**Token Metrics:**
- **Sold PFT:** Tokens purchased by contributors
- **Unsold PFT:** Tokens still available
- **Exchanged PFT:** APT tokens converted to PFT

### Privacy & Data

**Your Data Stays Private:**
- All analytics run in your browser
- No data sent to external servers
- Historical data stored locally (localStorage)
- You can clear data anytime via browser settings

**Clearing Analytics Data:**
```javascript
// In browser console
localStorage.clear()
```

Or use browser settings:
- Chrome: Settings → Privacy → Clear browsing data → Cookies and site data
- Firefox: Settings → Privacy & Security → Clear Data
- Safari: Preferences → Privacy → Manage Website Data

## For Project Owners

### Tracking Your Project

1. Navigate to Analytics page
2. Find your project in the list
3. Click to view detailed metrics
4. Check funding progress and contributor stats
5. Export data for your records

### Best Practices

- **Check Regularly:** Visit analytics to build historical data
- **Export Backups:** Periodically export your project data
- **Monitor Trends:** Watch for patterns in contribution timing
- **Share Reports:** Export and share data with stakeholders

### Understanding Contributor Patterns

The time-series chart shows:
- How funding progressed over time
- Contribution spikes (marketing campaigns working?)
- Refund patterns (potential concerns?)
- Steady vs sporadic funding

## Troubleshooting

### No Historical Data Showing

**Problem:** Time-series chart says "Data will appear here..."

**Solution:** 
- Historical data is collected each time you view analytics
- Visit the project's analytics page multiple times over days/weeks
- Data accumulates automatically with each visit

### Charts Not Rendering

**Problem:** Charts appear blank or don't load

**Solution:**
- Ensure JavaScript is enabled
- Try a different browser
- Clear cache and reload
- Check browser console for errors

### Export Not Working

**Problem:** Export button doesn't download file

**Solution:**
- Check browser's popup blocker settings
- Ensure JavaScript is enabled
- Try a different browser
- Check that you have write permissions

### Data Not Persisting

**Problem:** Analytics reset when reopening browser

**Solution:**
- Check if browser is in private/incognito mode
- Ensure localStorage is enabled
- Check browser storage settings
- Verify site isn't blocked by privacy extensions

## Support

For issues or questions:
- GitHub Issues: https://github.com/StabilityNexus/BenefactionPlatform-Ergo/issues
- Discord: https://discord.com/channels/995968619034984528/1283799987582406737

## Technical Details

For developers wanting to extend the analytics feature, see:
- `ANALYTICS_FEATURE.md` - Complete feature documentation
- `IMPLEMENTATION_SUMMARY.md` - Implementation details
- Source code in `src/lib/analytics/` and `src/routes/Analytics.svelte`

---

**Happy Analyzing! 📊**
