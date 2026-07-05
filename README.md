# text-svg-to-gcode

        Gerador público de G-code para *plotter/CNC* a partir de **texto** ou **SVG**.

        O foco deste repositório é bem direto:

        - entrada em texto com fonte fixa
        - entrada em SVG vetorial
        - saída em G-code pronta para automação
        - presets versionados para máquina, servo e parâmetros de desenho

        ## O que ele faz

        - converte texto em vetores usando uma fonte TTF fixa
        - converte SVG em trajetórias
        - gera G-code com comandos de caneta/servo configuráveis
        - exporta também um SVG intermediário para inspeção
        - roda localmente ou via GitHub Actions

        ## Estrutura

        - `text_svg_gcode/` — código principal
        - `presets/default_machine.json` — parâmetros da máquina/servo
        - `examples/` — entradas de exemplo
        - `.github/workflows/generate.yml` — automação no GitHub Actions

        ## Configuração dos parâmetros do servo

        Os parâmetros ficam versionados no preset:

        - `pen_up_command`
        - `pen_down_command`
        - `pen_up_angle`
        - `pen_down_angle`
        - `servo_dwell_ms`

        Se o seu firmware usar outros comandos, basta ajustar o JSON do preset.

        ## Como usar localmente

        1. Instale as dependências:

        ```bash
        python3 -m venv .venv
        . .venv/bin/activate
        pip install -r requirements.txt
        ```

        2. Gere G-code a partir de texto:

        ```bash
        python -m text_svg_gcode text           --text "HELLO
ESP32"           --preset presets/default_machine.json           --output dist/hello.gcode           --svg-output dist/hello.svg
        ```

        3. Gere G-code a partir de SVG:

        ```bash
        python -m text_svg_gcode svg           --input examples/sample.svg           --preset presets/default_machine.json           --output dist/sample.gcode           --svg-output dist/sample.svg
        ```

        ## GitHub Actions

        O workflow `Generate G-code` permite disparar a conversão por `workflow_dispatch`.
        Ele publica o arquivo final como artifact.

        ## Dependências

        - Python 3.11+
        - `fonttools`
        - `svgpathtools`

        ## Observações

        - O caminho de fonte padrão usado nos exemplos é `DejaVu Sans`.
        - O projeto foi pensado para plotter DIY, mas o preset também serve para outras CNCs com servo.
        - O G-code gerado usa `G21`, `G90`, `M3` e `M5` por padrão.
