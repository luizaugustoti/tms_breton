import os
import re

directory = 'c:/tms_breton_V2/frontend/pages'

nav_template = """        <nav class="sidebar__nav">
            <a href="dashboard.html"       class="sidebar__link{dashboard}"><span class="sidebar__icon">📊</span> Dashboard</a>
            <a href="cadastros.html"       class="sidebar__link{cadastros}"><span class="sidebar__icon">📁</span> Cadastros</a>
            <a href="estoque.html"         class="sidebar__link{estoque}"><span class="sidebar__icon">🏭</span> Estoque</a>
            <a href="pedidos.html"         class="sidebar__link{pedidos}"><span class="sidebar__icon">📦</span> Operacional</a>
            <a href="painel-motorista.html" class="sidebar__link{painel_motorista}"><span class="sidebar__icon">📱</span> Painel do Motorista</a>
            <a href="indicadores.html"     class="sidebar__link{indicadores}"><span class="sidebar__icon">📈</span> Indicadores</a>
            <a href="satisfacao.html"      class="sidebar__link{satisfacao}"><span class="sidebar__icon">⭐</span> Satisfação</a>
            <a href="administracao.html"   class="sidebar__link{administracao}"><span class="sidebar__icon">⚙️</span> Administração</a>
        </nav>"""

keys_map = {
    'dashboard.html': 'dashboard',
    'cadastros.html': 'cadastros',
    'estoque.html': 'estoque',
    'pedidos.html': 'pedidos',
    'roteirizacao.html': 'pedidos',
    'painel-motorista.html': 'painel_motorista',
    'indicadores.html': 'indicadores',
    'satisfacao.html': 'satisfacao',
    'administracao.html': 'administracao'
}

for filename in os.listdir(directory):
    if filename.endswith(".html"):
        filepath = os.path.join(directory, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Check if the file actually has the nav block
        if '<nav class="sidebar__nav">' in content:
            # Prepare formatting args for the active link
            format_args = {k: '' for k in keys_map.values()}
            if filename in keys_map:
                format_args[keys_map[filename]] = ' sidebar__link--active'
                
            new_nav = nav_template.format(**format_args)
            
            # Replace the old nav with the new nav
            updated_content = re.sub(r'<nav class="sidebar__nav">.*?</nav>', new_nav, content, flags=re.DOTALL)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(updated_content)
            print(f"✅ Atualizado: {filename}")
