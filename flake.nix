{
  inputs = {
    utils.url = "github:numtide/flake-utils";
  };
  outputs = { self, nixpkgs, utils }: utils.lib.eachDefaultSystem (system:
    let
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShell = pkgs.mkShell {
        buildInputs = with pkgs; [
          # Same major version as the container; >= 22.18 is required to run TypeScript directly.
          nodejs_24
          vtsls
          typescript
          nodePackages.vscode-json-languageserver
          tailwindcss-language-server
        ];
      };
    }
  );
}
