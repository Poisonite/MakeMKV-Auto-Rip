#include <napi.h>
#ifdef _WIN32
#include <windows.h>
#include <winioctl.h>
#include <shlobj.h>  // For Shell API
#include <string>
#include <vector>
#include <iostream>
#endif

using namespace Napi;

#ifdef _WIN32
// Windows-specific implementation using DeviceIoControl
class WindowsOpticalDrive {
public:
    // Try Shell API approach (doesn't require admin)
    static bool EjectDriveShellAPI(const std::string& driveLetter) {
        std::cout << "[C++ DEBUG] Trying Shell API eject for: " << driveLetter << std::endl;
        
        // Convert drive letter to root path (e.g., "D:" -> "D:\\")
        std::string rootPath = driveLetter.substr(0, 1) + ":\\";
        
        // Try using SHEjectDisk - this often works without admin rights
        DWORD result = SHEjectDisk(rootPath.c_str());
        
        std::cout << "[C++ DEBUG] SHEjectDisk result: " << result << std::endl;
        return result == ERROR_SUCCESS;
    }

    static bool EjectDrive(const std::string& driveLetter) {
        // Debug output to console
        std::cout << "[C++ DEBUG] EjectDrive received: \"" << driveLetter << "\" (length: " << driveLetter.length() << ")" << std::endl;
        
        // First try DeviceIoControl approach (fastest, but requires admin)
        std::wstring devicePath = L"\\\\.\\" + std::wstring(driveLetter.begin(), driveLetter.end());
        
        // Debug output for device path
        std::wcout << L"[C++ DEBUG] Device path: \"" << devicePath << L"\"" << std::endl;
        
        HANDLE hDevice = CreateFileW(
            devicePath.c_str(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            NULL,
            OPEN_EXISTING,
            0,
            NULL
        );

        if (hDevice != INVALID_HANDLE_VALUE) {
            DWORD bytesReturned;
            BOOL result = DeviceIoControl(
                hDevice,
                IOCTL_STORAGE_EJECT_MEDIA,
                NULL,
                0,
                NULL,
                0,
                &bytesReturned,
                NULL
            );

            CloseHandle(hDevice);
            
            if (result) {
                std::cout << "[C++ DEBUG] DeviceIoControl eject succeeded" << std::endl;
                return true;
            }
        }
        
        // DeviceIoControl failed, try Shell API approach
        DWORD error = GetLastError();
        std::cout << "[C++ DEBUG] DeviceIoControl failed with error: " << error << ", trying Shell API..." << std::endl;
        
        return EjectDriveShellAPI(driveLetter);
    }

    static bool LoadDrive(const std::string& driveLetter) {
        // Debug output to console
        std::cout << "[C++ DEBUG] LoadDrive received: \"" << driveLetter << "\" (length: " << driveLetter.length() << ")" << std::endl;
        
        // First try DeviceIoControl approach (fastest, but requires admin)
        std::wstring devicePath = L"\\\\.\\" + std::wstring(driveLetter.begin(), driveLetter.end());
        
        // Debug output for device path
        std::wcout << L"[C++ DEBUG] Device path: \"" << devicePath << L"\"" << std::endl;
        
        HANDLE hDevice = CreateFileW(
            devicePath.c_str(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            NULL,
            OPEN_EXISTING,
            0,
            NULL
        );

        if (hDevice != INVALID_HANDLE_VALUE) {
            DWORD bytesReturned;
            BOOL result = DeviceIoControl(
                hDevice,
                IOCTL_STORAGE_LOAD_MEDIA,
                NULL,
                0,
                NULL,
                0,
                &bytesReturned,
                NULL
            );

            CloseHandle(hDevice);
            
            if (result) {
                std::cout << "[C++ DEBUG] DeviceIoControl load succeeded" << std::endl;
                return true;
            }
        }
        
        // DeviceIoControl failed - unfortunately there's no Shell API equivalent for loading
        DWORD error = GetLastError();
        std::cout << "[C++ DEBUG] DeviceIoControl load failed with error: " << error << std::endl;
        std::cout << "[C++ DEBUG] Note: Loading drives without admin rights is not supported by Windows APIs" << std::endl;
        
        return false;
    }
};
#endif

// Node.js wrapper functions
Value EjectDrive(const CallbackInfo& info) {
    Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        TypeError::New(env, "Drive letter argument required").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string driveLetter = info[0].As<String>().Utf8Value();

#ifdef _WIN32
    bool success = WindowsOpticalDrive::EjectDrive(driveLetter);
    return Boolean::New(env, success);
#else
    TypeError::New(env, "Native optical drive operations only supported on Windows").ThrowAsJavaScriptException();
    return env.Null();
#endif
}

Value LoadDrive(const CallbackInfo& info) {
    Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        TypeError::New(env, "Drive letter argument required").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string driveLetter = info[0].As<String>().Utf8Value();

#ifdef _WIN32
    bool success = WindowsOpticalDrive::LoadDrive(driveLetter);
    return Boolean::New(env, success);
#else
    TypeError::New(env, "Native optical drive operations only supported on Windows").ThrowAsJavaScriptException();
    return env.Null();
#endif
}

Object Init(Env env, Object exports) {
    exports.Set(String::New(env, "ejectDrive"), Function::New(env, EjectDrive));
    exports.Set(String::New(env, "loadDrive"), Function::New(env, LoadDrive));
    return exports;
}

NODE_API_MODULE(optical_drive_native, Init)