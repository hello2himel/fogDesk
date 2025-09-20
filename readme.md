# Study Buddy - HSC Study Tracker

A modern, responsive web application designed to help HSC (Higher Secondary Certificate) students track their syllabus progress and manage their study schedule effectively. Built with vanilla JavaScript, HTML5, and CSS3 for optimal performance and compatibility.

**Live Demo:** [logdoinik.netlify.app](https://logdoinik.netlify.app)

## Features

### Core Functionality
- **Syllabus Progress Tracking**: Track completion of chapters across all HSC subjects
- **Time Progress Visualization**: Visual progress bars showing time elapsed vs syllabus completed
- **Dual Progress System**: Compare your study progress against available time
- **Subject-wise Organization**: Organized by subjects with paper-wise chapter breakdown
- **Note-taking**: Add personal notes to any chapter
- **Data Export**: Export progress data in CSV or JSON format

### Study Configuration
- **Customizable Study Period**: Set your own start and end dates for exam preparation
- **Multiple Syllabus Support**: Choose between different syllabus configurations
- **Flexible Task System**: Enable or disable task tracking based on your needs

### Task & Schedule Management (Optional)
- **Daily Task Tracking**: Track completion of daily study tasks
- **Smart Schedule Display**: Shows current, previous, and next tasks
- **Rotation System**: Automatic subject rotation for balanced study
- **Task History**: View your task completion patterns over the past week
- **Schedule Visualization**: Detailed view of daily study schedule

### Cloud Sync & Backup
- **GitHub Gist Integration**: Sync your data across multiple devices
- **QR Code Backup**: Generate QR codes containing your complete backup
- **Cross-device Sync**: Access your progress from any device
- **Offline Support**: Works completely offline when needed
- **Automatic Backup**: Regular cloud backups of your progress

### User Experience
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Dark/Light Theme Support**: Automatically adapts to system preferences
- **Keyboard Shortcuts**: Quick actions for power users
- **Real-time Updates**: Live progress updates as you mark chapters complete
- **Clean Interface**: Minimalist design focused on functionality

## Getting Started

### Quick Start
1. Visit [logdoinik.netlify.app](https://logdoinik.netlify.app)
2. Configure your study period in Settings
3. Choose your syllabus type
4. Start tracking your progress!

### Local Development
```bash
# Clone the repository
git clone https://github.com/hello2himel/studybuddy.git

# Navigate to project directory
cd studyBuddy

# Serve locally (any HTTP server works)
npx serve .
# or
python -m http.server 8000
# or
php -S localhost:8000
```

The application requires an HTTP server due to CORS restrictions when loading JSON configuration files.

## File Structure

```
Study-Buddy/
├── index.html              # Main application page
├── settings.html           # Settings and configuration page
├── style/
│   ├── index.css          # Main application styles
│   └── settings.css       # Settings page styles
├── script/
│   ├── index.js           # Main application logic
│   └── settings.js        # Settings page functionality
├── config/
│   ├── syllabus.json      # Default HSC syllabus configuration
│   ├── routine.json       # Daily schedule templates
│   └── *.json            # Additional syllabus configurations
└── README.md              # This file
```

## Configuration

### Syllabus Configuration
The `config/syllabus.json` file contains the chapter structure:

```json
{
  "Physics": {
    "Paper 1": [
      {
        "id": "phy-1-01",
        "title": "Chapter 1: Physical World",
        "done": false,
        "note": ""
      }
    ]
  }
}
```

### Routine Configuration
The `config/routine.json` file defines daily schedules:

```json
{
  "sunTueThu": {
    "morning": [
      {
        "id": "morning-1",
        "name": "Physics Class",
        "time": "8:00 AM - 10:00 AM"
      }
    ],
    "selfStudy": [
      {
        "id": "study-1",
        "name": "${rotationSubject} Practice",
        "time": "2:00 PM - 4:00 PM"
      }
    ]
  }
}
```

## Cloud Sync Setup

### GitHub Integration
1. Create a [GitHub Personal Access Token](https://github.com/settings/tokens)
2. Grant `gist` scope permissions
3. Enter token in Settings > Account & Sync
4. Create or connect to an existing Gist

### Backup & Restore
- **QR Code Backup**: Generate QR codes containing your complete configuration
- **Cross-device Import**: Scan QR codes to transfer settings between devices
- **Cloud Sync**: Automatic synchronization with GitHub Gists

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Sync to cloud |
| `Ctrl+E` | Export data as CSV |
| `Ctrl+R` | Reset all progress |
| `Escape` | Close current modal |
| `Space`  | Toggle chapter completion (when focused) |

## API Integration

### GitHub Gist API
The application uses GitHub's Gist API for cloud synchronization:

- **Create Gist**: `POST /gists`
- **Update Gist**: `PATCH /gists/{id}`
- **Fetch Gist**: `GET /gists/{id}`

All API calls require proper authentication via Personal Access Token.

## Data Privacy & Security

- **Local Storage**: All data stored locally in browser localStorage
- **Token Security**: GitHub tokens stored locally, never transmitted to third parties
- **Private Gists**: All cloud data stored in private GitHub Gists
- **No Analytics**: No tracking or analytics implemented
- **Offline Capable**: Full functionality available without internet connection

## Browser Compatibility

- **Modern Browsers**: Chrome 60+, Firefox 60+, Safari 12+, Edge 79+
- **Mobile Support**: iOS Safari, Chrome Mobile, Firefox Mobile
- **Progressive Web App**: Can be installed as a native app on mobile devices
- **Local Storage**: Requires localStorage support (available in all modern browsers)

## Customization

### Adding New Syllabi
1. Create a new JSON file in the `config/` directory
2. Follow the existing syllabus structure
3. Add the option to the settings dropdown
4. Users can select it from Settings > Study Configuration

### Modifying Schedules
Edit `config/routine.json` to customize:
- Daily time slots
- Task names and durations
- Different schedules for different days
- Subject rotation patterns

### Styling Customization
The application uses CSS custom properties for easy theming:

```css
:root {
  --primary-color: #111827;
  --secondary-color: #6b7280;
  --success-color: #059669;
  --error-color: #dc2626;
}
```

## Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly across devices
5. Submit a pull request

### Guidelines
- Maintain vanilla JavaScript approach (no frameworks)
- Ensure mobile responsiveness
- Follow existing code patterns
- Add appropriate error handling
- Update documentation as needed

## Troubleshooting

### Common Issues

**Sync Failures**
- Check GitHub token validity
- Verify Gist ID exists and is accessible
- Ensure stable internet connection

**Data Loss**
- Use QR code backups before clearing data
- Regular cloud sync prevents local data loss
- Export CSV files for external backup

**Performance Issues**
- Clear browser cache
- Check available localStorage space
- Disable unnecessary features in settings

**Mobile Issues**
- Ensure HTTPS connection for camera access
- Check browser permissions for QR scanning
- Use landscape mode for better visibility

## License

This project is open source and available under the MIT License.

## Support

For bug reports, feature requests, or general support:
- Create an issue on GitHub
- Check existing documentation
- Review troubleshooting section

## Changelog

### Version 2.0.0
- Added configurable study periods
- Multiple syllabus support
- Enhanced cloud sync with settings backup
- Improved QR code backup system
- Optional task tracking
- Better mobile experience

### Version 1.0.0
- Initial release
- Basic syllabus tracking
- GitHub Gist integration
- Responsive design
- Task scheduling system

---

Built with care for HSC students. Study smart, track progress, achieve goals.