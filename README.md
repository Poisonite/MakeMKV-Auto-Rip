# MakeMKV-Auto-Rip v0.6.0
Automatically rips DVDs and BluRay Discs using the MakeMKV console and saves them to unique folders.

# Disclaimer
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
    See the GNU General Public License for more details.
    Please read the LICENCE.md file for more info.

    MakeMKV-Auto-Rip is not linked in any way to MakeMKV and as such isn't "official" and the two are not developed by the same people.

# General Info
You can now configure system unique info from the Default.json file and as such MakeMKV Auto Rip is now recommended to the general public!!!

MakeMKV is not included in this software and it never will be, however, the use of this software is dependent upon MakeMKV and as such the user should download and install it from the MakeMKV website on any system where MakeMKV Auto Rip will be used.

Some features of MakeMKV (not MakeMKV Auto Rip) rely on Java and as such it is recommended to have Java installed on computers where MakeMKV Auto Rip or the GUI version of MakeMKV will be used.

NodeJS is required for this program and as such it must be downloaded prior to running the program.

MakeMKV Auto Rip is only intended to run on windows-based machines and will only be tested for Windows 10 unless stated otherwise, should you wish to attempt to run this software on a different operating system you are free to do so but should go into the endeavor with the knowledge that MakeMKV Auto Rip has never been tested for such a scenario.
    If you do use this for Linux or even MacOS let me know how it works, I'm always interested to learn how my work is being used

I HIGHLY recommend reading this entire file as it provides important info on much of MakeMKV-Auto-Rip

# External Software Requirements
The following programs are required or recommended for MakeMKV-Auto-Rip to function properly

1. MakeMKV
    Nothing will run without this as all of the ripping commands and the folder gen commands require info given by the console of MakeMKV

2. NodeJS
    MakeMKV-Auto-Rip is entirely built in Node.js and requires it to run
    MakeMKV-Auto-Rip has been tested for NodeJS version 10.4.0 and NPM version 6.1.0

3. Java
    This is not strictly required but certain features of the standard MakeMKV program do require it, therefore it's recommended to have.

4. VLC media player with .mkv codec support
    This is also not required but helpful so that ripped files can be viewed without having to convert them to an alternate file format (which is also recommended).

# Installing
Follow these instructions to install and use MakeMKV Auto Rip.
1. First download this repository
2. Download and install NodeJS
3. Then run the Install-Node-Packages.bat file to install all of the Node.js dependencies required
4. Create an empty folder (anywhere on the computer) to send ripped discs to. (If you would like disc logging also create a folder for that)
5. Configure the Default.json file found in the config folder (see the "Default.json Configuration and Info" section for expanded details on what each setting does)
6. Configure the Graphical MakeMKV interface using the settings in the "MakeMKV GUI Config" section below
7. Run AutoRip.bat and now you're all set to rip any DVD or Blu-ray Disc

# Default.json Configuration and Info
Inside the Default.json file located within the config folder in the root MakeMKV Auto Rip folder there are a few settings which must be configured prior to running MakeMKV Auto Rip.

mkvDir
The setting for mkvDir (that is to say the "Dir" variable which is nested within mkvDir) controls where the program will search for the MakeMKV program directory.
By default, the config file is configured to look in the default install path for MakeMKV (as of version 1.12.3), due to this if you installed MakeMKV to its default location on the C drive this setting can be left alone.
If you change this setting make sure to use 2 \ (slashes) rather than just 1.
    ex: C:\\users\\me
    NOT C:\users\me

MovieRips
The setting for movieRips (that is to say the "Dir" variable which is nested within movieRips) controls where the program will set the root directory for movie rips.
    This setting is set to C:\\ by default and will place all movie rips in unique folders (custom named folder for each disc) within that location.
    It is HIGHLY recommended that you change this path to another location and give it its own folder.
        ex: C:\\Users\\myUser\\Videos\\myMovieRips
        NOT C:\\Users\\myUser\\Videos
    If you use the second example all movies will be placed directly into that folder without a wrapper folder making the overall organization of your movies worse.
        Basically, create a unique folder just for your movie rips.
    Also make sure that the path you insert is valid (i.e. the program can't create the folders required by the path if they don't exist)
    If you change this setting make sure to use 2 \ (slashes) rather than just 1.
        ex: C:\\users\\me
        NOT C:\users\me

logToFiles
This setting tree as 2 options within it.
The first option (Enabled) determines whether a log file will be generated for each disc that is ripped.
    The setting is not case sensitive, "true" will enable logging, "false" will disable logging
The second option (Dir) determines where the logs will be saved to
    Dual slashes (\) must be used in the file path
    It is recommended to create a unique and empty folder to store logs in
    The system can't generate folders so every folder in the file path must be created manually, before running the script

ejectDVDs
This setting determines whether all disc drives connected to the system will be ejected after ALL discs have been ripped.
    The setting is not case sensitive, "true" will enable disc ejecting, "false" will disable disc ejecting

ripAll
This setting determines whether to rip all videos on each disk or only the longest one. By default this is 'false' (good for movies).
    Setting this to true will rip all video files above the minimum title length set in MakeMKV GUI.

# MakeMKV GUI Config
In: View > Preferences > Video change "Minimum title length (seconds):" to any number below 1000
    You could set it above or below 1000 but if the number is too high the program will disregard all titles (since most movies are only 1.5 to 2 hours) and no file will be ripped\
Change the "Read retry count:" to 10 in the IO tab in preferences
    This is helpful for some discs that are very scratched
In the Language tab set the interface and preferred languages to whatever language you would like for subtitles and audio, selecting auto and none will take all audio and subtitle tracks that a disc contains.

All other settings can be left at default properties unless you changed the install location of Java from its default
    In which case set the "Custom Java executable location" property in the Protection tab in preferences
If you plan on ripping any Blu-Ray discs at least one must be run through the GUI and a key must be entered into MakeMKV (The beta key will work) before MakeMKV Auto Rip will work

# DriveLoader.bat Info
This file is intended to be used for ejecting and loading all the disc drives connected to the system (USB, SATA, and otherwise)

All drives should be able to eject using this script, however, loading with the script may not be possible for some slimline, USB, and laptop drives where there is no physical mechanism that is able to bring the tray back in.
    This rule also applies to the "ejectDVDs" setting in Default.json

# Install-Node-Packages.bat Info
This file installs all of the required node modules automatically, just by opening the file.