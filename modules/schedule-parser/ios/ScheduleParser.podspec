require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))
sdk_version = `xcrun --sdk iphoneos --show-sdk-version 2>/dev/null`.strip
if sdk_version.empty?
  sdk_version = `xcrun --sdk iphonesimulator --show-sdk-version 2>/dev/null`.strip
end
weak_foundation = false
begin
  weak_foundation = !sdk_version.empty? && Gem::Version.new(sdk_version) >= Gem::Version.new('26.0')
rescue StandardError
  weak_foundation = false
end

Pod::Spec.new do |s|
  s.name           = 'ScheduleParser'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = 'OurFamilySchedule'
  s.homepage       = 'https://github.com/tamdoan37/OurFamilySchedule'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
  s.frameworks = 'Vision', 'UIKit'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  if weak_foundation
    s.weak_frameworks = 'FoundationModels'
  end
end
