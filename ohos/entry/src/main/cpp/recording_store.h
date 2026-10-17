#pragma once
#include <cstddef>
#include <string>
namespace mfp {
constexpr size_t MAX_WRITE = 256 * 1024;
// Errors are errno values. No paths or recording data in error text.
int PrepareRoot(const std::string& trustedAppDownload, std::string& recordingRoot) noexcept;
int Create(const std::string& trustedRoot, const std::string& basename, std::string& token) noexcept;
int Write(const std::string& token, const unsigned char* data, size_t size, size_t& written) noexcept;
int Flush(const std::string& token) noexcept;
int Close(const std::string& token) noexcept;
int Finalize(const std::string& token, std::string& basename) noexcept;
// Abort preserves partial/final files for recovery; never deletes a published file.
int Abort(const std::string& token) noexcept;
int Release(const std::string& token) noexcept;
}
