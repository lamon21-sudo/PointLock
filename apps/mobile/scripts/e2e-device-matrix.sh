#!/bin/bash
# =====================================================
# E2E Device Matrix Test Runner
# =====================================================
# Runs E2E tests across multiple iOS and Android device sizes
# Usage: ./scripts/e2e-device-matrix.sh [--ios-only] [--android-only]

set -e

FLOW_DIR=".maestro/flows"
RESULTS_DIR=".maestro/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Parse arguments
RUN_IOS=true
RUN_ANDROID=true
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --ios-only) RUN_ANDROID=false ;;
        --android-only) RUN_IOS=false ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

# Create results directory
mkdir -p "$RESULTS_DIR/$TIMESTAMP"

# iOS Devices (requires macOS)
IOS_DEVICES=(
    "iPhone SE (3rd generation)"
    "iPhone 14"
    "iPhone 15 Pro Max"
)

# Android Devices
ANDROID_DEVICES=(
    "Pixel_4a"
    "Pixel_6"
    "Pixel_7_Pro"
)

echo "======================================"
echo "Pick Rivals E2E Device Matrix Tests"
echo "Timestamp: $TIMESTAMP"
echo "======================================"

# Check if Maestro is installed
if ! command -v maestro &> /dev/null; then
    echo "Error: Maestro CLI not found. Install with:"
    echo "  curl -Ls https://get.maestro.mobile.dev | bash"
    exit 1
fi

# Function to run tests on a device
run_device_tests() {
    local device="$1"
    local platform="$2"
    local safe_name=$(echo "$device" | tr ' ' '_' | tr '()' '__')

    echo ""
    echo "Testing on: $device ($platform)"
    echo "--------------------------------------"

    local output_file="$RESULTS_DIR/$TIMESTAMP/${platform}_${safe_name}.xml"
    local log_file="$RESULTS_DIR/$TIMESTAMP/${platform}_${safe_name}.log"

    # Run maestro test with JUnit output
    if maestro test \
        --device "$device" \
        --format junit \
        --output "$output_file" \
        "$FLOW_DIR" 2>&1 | tee "$log_file"; then
        echo "PASSED: $device"
        return 0
    else
        echo "FAILED: $device"
        return 1
    fi
}

# Track failures
FAILED_DEVICES=()
PASSED_DEVICES=()

# Run iOS tests (macOS only)
if [ "$RUN_IOS" = true ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo ""
        echo "======================================"
        echo "Running iOS Simulator Tests"
        echo "======================================"

        for device in "${IOS_DEVICES[@]}"; do
            if run_device_tests "$device" "ios"; then
                PASSED_DEVICES+=("iOS: $device")
            else
                FAILED_DEVICES+=("iOS: $device")
            fi
        done
    else
        echo ""
        echo "Skipping iOS tests (macOS required)"
    fi
fi

# Run Android tests
if [ "$RUN_ANDROID" = true ]; then
    echo ""
    echo "======================================"
    echo "Running Android Emulator Tests"
    echo "======================================"

    for device in "${ANDROID_DEVICES[@]}"; do
        if run_device_tests "$device" "android"; then
            PASSED_DEVICES+=("Android: $device")
        else
            FAILED_DEVICES+=("Android: $device")
        fi
    done
fi

# Summary
echo ""
echo "======================================"
echo "Device Matrix Test Summary"
echo "======================================"
echo "Results saved to: $RESULTS_DIR/$TIMESTAMP/"
echo ""
echo "Passed: ${#PASSED_DEVICES[@]}"
for device in "${PASSED_DEVICES[@]}"; do
    echo "  ✅ $device"
done
echo ""
echo "Failed: ${#FAILED_DEVICES[@]}"
for device in "${FAILED_DEVICES[@]}"; do
    echo "  ❌ $device"
done

if [ ${#FAILED_DEVICES[@]} -gt 0 ]; then
    echo ""
    echo "Some tests failed. Check logs in $RESULTS_DIR/$TIMESTAMP/"
    exit 1
else
    echo ""
    echo "All device tests passed!"
    exit 0
fi
