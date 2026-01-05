#!/bin/bash

set -e 

LINK_REACT=false
LINK_SOLID=false
TARGET_ROOT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --react)
            LINK_REACT=true
            shift
            ;;
        --solid)
            LINK_SOLID=true
            shift
            ;;
        *)
            TARGET_ROOT="$1"
            shift
            ;;
    esac
done

if [ -z "$TARGET_ROOT" ]; then
    echo "Usage: $0 <target-project-root> [--react] [--solid]"
    echo "Example: $0 /path/to/your/project"
    echo "Example: $0 /path/to/your/project --solid"
    echo "Example: $0 /path/to/your/project --react"
    echo ""
    echo "This script links OpenTUI dev packages into Bun's cache directory."
    echo "All workspace packages will automatically resolve through the cache."
    echo ""
    echo "Options:"
    echo "  --react    Also link @opentui/react and React dependencies"
    echo "  --solid    Also link @opentui/solid and solid-js"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENTUI_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_MODULES_DIR="$TARGET_ROOT/node_modules"

if [ ! -d "$TARGET_ROOT" ]; then
    echo "Error: Target project root directory does not exist: $TARGET_ROOT"
    exit 1
fi

if [ ! -d "$NODE_MODULES_DIR" ]; then
    echo "Error: node_modules directory does not exist: $NODE_MODULES_DIR"
    echo "Please run 'bun install' in the target project first."
    exit 1
fi

if [ ! -d "$NODE_MODULES_DIR/.bun" ]; then
    echo "Error: Bun cache directory not found: $NODE_MODULES_DIR/.bun"
    echo "This script is designed for Bun package manager."
    exit 1
fi

echo "Linking OpenTUI dev packages from: $OPENTUI_ROOT"
echo "To Bun cache in: $NODE_MODULES_DIR/.bun"
echo

# Helper function to link a package in Bun cache
link_in_bun_cache() {
    local package_pattern="$1"
    local package_name="$2"
    local source_path="$3"
    
    local cache_dirs=$(find "$NODE_MODULES_DIR/.bun" -maxdepth 1 -type d -name "$package_pattern" 2>/dev/null)
    
    if [ -z "$cache_dirs" ]; then
        echo "⚠ Warning: No Bun cache found for $package_name"
        return 0
    fi
    
    echo "$cache_dirs" | while read -r cache_dir; do
        if [ -n "$cache_dir" ] && [ -d "$cache_dir" ]; then
            local target_dir="$cache_dir/node_modules/$package_name"
            local target_parent=$(dirname "$target_dir")
            
            # Remove existing directory/symlink
            if [ -e "$target_dir" ] || [ -L "$target_dir" ]; then
                rm -rf "$target_dir"
            fi
            
            # Create parent directory if needed
            mkdir -p "$target_parent"
            
            # Create symlink
            ln -s "$source_path" "$target_dir"
            echo "  ✓ Linked $package_name in $(basename "$cache_dir")"
        fi
    done
}

# Helper function to link a package in node_modules (to avoid duplicates)
link_in_node_modules() {
    local package_name="$1"
    local source_path="$2"
    
    local target_dir="$NODE_MODULES_DIR/$package_name"
    local target_parent=$(dirname "$target_dir")
    
    # Remove existing directory/symlink
    if [ -e "$target_dir" ] || [ -L "$target_dir" ]; then
        rm -rf "$target_dir"
    fi
    
    # Create parent directory if needed (for scoped packages like @opentui/core)
    mkdir -p "$target_parent"
    
    # Create symlink
    ln -s "$source_path" "$target_dir"
    echo "  ✓ Linked $package_name in node_modules"
}

# Helper function to remove nested dependency from opentui package
# This prevents duplicate packages when the opentui package has its own node_modules
remove_nested_dep() {
    local opentui_package="$1"
    local dep_name="$2"
    
    local nested_path="$OPENTUI_ROOT/packages/$opentui_package/node_modules/$dep_name"
    
    if [ -e "$nested_path" ] || [ -L "$nested_path" ]; then
        rm -rf "$nested_path"
        echo "  ✓ Removed nested $dep_name from packages/$opentui_package"
    fi
}

# Always link @opentui/core
echo "Linking @opentui/core..."
link_in_bun_cache "@opentui+core@*" "@opentui/core" "$OPENTUI_ROOT/packages/core"
link_in_node_modules "@opentui/core" "$OPENTUI_ROOT/packages/core"

# Link yoga-layout (required by core)
echo "Linking yoga-layout..."
if [ -d "$OPENTUI_ROOT/node_modules/yoga-layout" ]; then
    link_in_bun_cache "yoga-layout@*" "yoga-layout" "$OPENTUI_ROOT/node_modules/yoga-layout"
    link_in_node_modules "yoga-layout" "$OPENTUI_ROOT/node_modules/yoga-layout"
elif [ -d "$OPENTUI_ROOT/packages/core/node_modules/yoga-layout" ]; then
    link_in_bun_cache "yoga-layout@*" "yoga-layout" "$OPENTUI_ROOT/packages/core/node_modules/yoga-layout"
    link_in_node_modules "yoga-layout" "$OPENTUI_ROOT/packages/core/node_modules/yoga-layout"
else
    echo "⚠ Warning: yoga-layout not found in OpenTUI node_modules"
fi

# Link web-tree-sitter (required by core)
echo "Linking web-tree-sitter..."
if [ -d "$OPENTUI_ROOT/node_modules/web-tree-sitter" ]; then
    link_in_bun_cache "web-tree-sitter@*" "web-tree-sitter" "$OPENTUI_ROOT/node_modules/web-tree-sitter"
    link_in_node_modules "web-tree-sitter" "$OPENTUI_ROOT/node_modules/web-tree-sitter"
elif [ -d "$OPENTUI_ROOT/packages/core/node_modules/web-tree-sitter" ]; then
    link_in_bun_cache "web-tree-sitter@*" "web-tree-sitter" "$OPENTUI_ROOT/packages/core/node_modules/web-tree-sitter"
    link_in_node_modules "web-tree-sitter" "$OPENTUI_ROOT/packages/core/node_modules/web-tree-sitter"
else
    echo "⚠ Warning: web-tree-sitter not found in OpenTUI node_modules"
fi

# Link @opentui/solid if requested
if [ "$LINK_SOLID" = true ]; then
    # Remove nested dependencies from @opentui/solid to prevent duplicates
    echo "Removing nested dependencies from @opentui/solid..."
    remove_nested_dep "solid" "solid-js"
    
    echo "Linking @opentui/solid..."
    link_in_bun_cache "@opentui+solid@*" "@opentui/solid" "$OPENTUI_ROOT/packages/solid"
    link_in_node_modules "@opentui/solid" "$OPENTUI_ROOT/packages/solid"
    
    # Link solid-js from target project's node_modules (not from opentui)
    # This ensures @opentui/solid uses the same solid-js as the target project
    echo "Linking solid-js..."
    link_in_bun_cache "solid-js@*" "solid-js" "$NODE_MODULES_DIR/solid-js"
fi

# Link @opentui/react if requested
if [ "$LINK_REACT" = true ]; then
    # Remove nested dependencies from @opentui/react to prevent duplicates
    echo "Removing nested dependencies from @opentui/react..."
    remove_nested_dep "react" "react"
    remove_nested_dep "react" "react-dom"
    remove_nested_dep "react" "react-reconciler"
    
    echo "Linking @opentui/react..."
    link_in_bun_cache "@opentui+react@*" "@opentui/react" "$OPENTUI_ROOT/packages/react"
    link_in_node_modules "@opentui/react" "$OPENTUI_ROOT/packages/react"
    
    # Link react dependencies from target project's node_modules (not from opentui)
    # This ensures @opentui/react uses the same react as the target project
    echo "Linking react..."
    link_in_bun_cache "react@*" "react" "$NODE_MODULES_DIR/react"
    
    echo "Linking react-dom..."
    link_in_bun_cache "react-dom@*" "react-dom" "$NODE_MODULES_DIR/react-dom"
    
    echo "Linking react-reconciler..."
    link_in_bun_cache "react-reconciler@*" "react-reconciler" "$NODE_MODULES_DIR/react-reconciler"
fi

echo
echo "✓ OpenTUI development linking complete!"
echo "  All workspace packages will now resolve to your dev version through Bun's cache."
