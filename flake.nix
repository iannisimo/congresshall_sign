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
          nodejs
          corepack
          vtsls
          typescript
          nodePackages.vscode-json-languageserver
          tailwindcss-language-server
          tmux
        ];
      };
    }
  );
}
