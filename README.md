# MakeMKV-Auto-Rip v0.3.1
Automatically rips DVDs using the MakeMKV console and saves them to unique folders.

# Disclaimer
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
	Please read the LICENCE.md file for more info

# General Info
You can now configure system unique info from the Config.json file and as such MakeMKV Auto Rip is now recommended to the general public!!

MakeMKV is not included in this software and it never will be, however, the use of this software is dependent upon MakeMKV and as such the end user should download and install it from the MakeMKV website on any system where MakeMKV Auto Rip will be used.

MakeMKV Auto Rip is only intended to run on windows based machines and will only be tested for Windows 10 unless stated otherwise, should you wish to attempt to run this software on a different operating system you are free to do so but should go into the endeavor with the knowledge that MakeMKV Auto Rip has never been tested for such a scenario.

# Config.json Configuration
Inside the config.json file located within the config folder in the root MakeMKV Auto Rip folder there are a few settings which must be configured prior to running MakeMKV Auto Rip.

The setting for mkvDir (that is to say the "Dir" variable which is nested within mkvDir) controls where the program will search for the MakeMKV program directory.
By default the config file is configured to look in the default install path for MakeMKV (as of version 1.12.3), due to this if you installed MakeMKV to its default location on the C drive this setting can be left alone.
If you change this setting make sure to use 2 \ (slashes) rather than just 1.
	ex: C:\\users\\me
	NOT C:\users\me

The setting for movieRips (that is to say the "Dir" variable which is nested within movieRips) controls where the program will set the root directory for movie rips.
This setting is set to C:\\ by default and will place all movie rips in unique folders (custom named folder for each disc) within that location.
It is HIGHLY recommended that you change this path to another location and give it its own folder.
	ex: C:\\Users\\myUser\\Videos\\myMovieRips
	NOT C:\\Users\\myUser\\Videos
If you use the second example all movies will be placed directly into that folder without a wrapper folder making the overall organization of your movies worse.
	Basically create a unique folder just for your movie rips
Also make sure that the path you insert is valid (i.e. the program can't/won't create the folders required by the path if they don't exist)
If you change this setting make sure to use 2 \ (slashes) rather than just 1.
	ex: C:\\users\\me
	NOT C:\users\me