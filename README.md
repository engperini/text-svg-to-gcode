# text-svg-to-gcode

Gerador público de G-code para *plotter/CNC* a partir de **texto**, **SVG** ou **imagem**.

O foco deste repositório é bem direto:

- entrada em texto com fonte fixa e opção single-line
- entrada em SVG vetorial
- entrada em imagem com vetorização no navegador
- saída em G-code pronta para automação
- presets versionados para máquina, servo e parâmetros de desenho
- interface web para usar direto no GitHub Pages

## O que ele faz

- converte texto em vetores usando fontes TTF e uma opção single-line para escrita simples
- converte SVG em trajetórias
- vetoriza imagem no navegador antes de gerar G-code
- gera G-code com comandos de caneta/servo configuráveis
- exporta também um SVG intermediário para inspeção
- roda localmente, via GitHub Actions ou pelo navegador no GitHub Pages

## Estrutura

- `text_svg_gcode/` — código principal da CLI
- `presets/default_machine.json` — parâmetros da máquina/servo
- `examples/` — entradas de exemplo
- `docs/` — interface web para GitHub Pages
- `.github/workflows/generate.yml` — automação no GitHub Actions
- `.github/workflows/pages.yml` — publicação da interface web no GitHub Pages

## Configuração dos parâmetros do servo

Os parâmetros ficam versionados no preset:

- `pen_up_command`
- `pen_down_command`
- `pen_up_angle`
- `pen_down_angle`
- `servo_dwell_ms`

Se o seu firmware usar outros comandos, basta ajustar o JSON do preset.

## Como usar no GitHub Pages

1. Depois de publicar este repositório, abra a página em GitHub Pages.
2. Escolha a entrada:
   - **Texto**: cole ou digite o conteúdo.
   - **SVG**: cole o SVG ou envie um arquivo.
   - **Imagem**: carregue PNG/JPG/WebP para vetorizar no navegador.
3. Ajuste os parâmetros da folha e da máquina:
   - tamanho da folha
   - margem
   - origem
   - escala
   - feed/travel
   - tempo de espera do servo
4. Se estiver usando texto, escolha a fonte no menu suspenso. A padrão agora é a *Hershey Simplex* (linha única).
5. Clique em **Gerar G-code**.
6. Use **Baixar .gcode** para salvar o arquivo final.

## Como usar localmente

1. Instale as dependências:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

2. Gere G-code a partir de texto:

```bash
python -m text_svg_gcode text \
  --text "HELLO\nESP32" \
  --preset presets/default_machine.json \
  --output dist/hello.gcode \
  --svg-output dist/hello.svg
```

3. Gere G-code a partir de SVG:

```bash
python -m text_svg_gcode svg \
  --input examples/sample.svg \
  --preset presets/default_machine.json \
  --output dist/sample.gcode \
  --svg-output dist/sample.svg
```

## GitHub Actions

- O workflow `Generate G-code` permite disparar a conversão por `workflow_dispatch`.
- O workflow `Deploy GitHub Pages` publica a interface web do diretório `docs/`.
- O arquivo final pode ser baixado como artifact no Actions.

## Dependências

- Python 3.11+
- `fonttools`
- `svgpathtools`
- navegador moderno para usar a interface web no GitHub Pages

## Observações

- O caminho de fonte padrão usado nos exemplos é `DejaVu Sans`.
- O projeto foi pensado para plotter DIY, mas o preset também serve para outras CNCs com servo.
- O G-code gerado usa `G21`, `G90`, `M3` e `M5` por padrão.
- A interface web usa folha A4 em modo retrato como padrão e ajusta a arte para caber na área útil.
- Para a interface web, habilite GitHub Pages no repositório e use a publicação do diretório `docs/`.
