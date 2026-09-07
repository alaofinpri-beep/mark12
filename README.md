# Attendance Companion

Build a standalone, installable Smart Attendance mobile app with a premium modern iOS-inspired interface.



UI



- Sky-blue gradient accents

- Clean white/light interface

- Inter, Roboto, or another premium modern app font

- Rounded cards, subtle shadows, smooth animations

- Compact, fully mobile-fit layout

- No web-style interface



App Opening



Create a minimal widescreen app-opening animation showing the app icon/logo before entering the app.



Provide a simple authentication screen with Google or Email account sign-in/sign-up.



Allow the authorized admin to customize/upload the app logo/icon from the admin settings.



Student



Main screen:



Mark Attendance



When opened, show:



Generate Code



The student taps it to display/copy the current attendance code, then enters the code into the verification field.



After entering the code, verify the code against the active attendance session and request real device location.



Show a real interactive map displaying:



- Admin's live attendance location

- Attendance-radius circle

- Student's current location

- Distance from the permitted area



Give clear guidance such as:



“You are 10 meters outside the attendance area. Move closer to verify.”



Update the distance/location in real time.



Only mark attendance when the code is valid and the student's actual location is inside the permitted radius.



Admin



Include an Admin Dashboard card inside the app, protected by an Admin Passkey, the passkey is (FEM2026)



Admin can:



- Write the course name/code manually

- Start Attendance

- Set attendance radius (default 30m)

- See their real-time location on the map

- See the attendance-radius circle

- See live present students

- Close Attendance



When attendance starts, the system automatically generates a secure attendance code.



The code is valid for 4 minutes.



When 4 minutes expires, automatically invalidate it and generate a new code while attendance remains active. The admin does not need to manually generate codes.



Final Report



When attendance is closed:



- Finalize present and absent students

- Show the complete attendance report inside the Admin Dashboard

- Allow the admin to view and download the report

- Also send the final report to the configured admin email



Core Flow



App Animation → Sign In → Student Mark Attendance / Admin Dashboard → Admin Starts Attendance → Auto-Generated 4-Minute Code → Student Enters Code → Real-Time GPS Map Verification → Attendance Confirmed → Live Admin Attendance → Close Session → Downloadable Present/Absent Report + Email



Make the entire prototype actually functional, polished, responsive, and optimized specifically for mobile devices.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mark12.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ebcab08f-c12f-406d-ab56-5746a49345b2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
