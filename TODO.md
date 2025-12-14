# EMUNAH

- Adicionar quantidade mínima de polaroids mini que serão 4 por 12 reais.
    - Adicionar pedido min pra cada item, os que não tiver irão ficar como null
- Adicionar descrição de cada item, o que compõe
- Adicionar pra reconhecer pedidos direto do catálogo do whatsapp
    - Quando a pessoa mandar o item do catálogo, pedir pra digitar o pedido
- Frete PADRÃO é 8.00
- Só faz o produto com pagamento adiantado
- Pix pode mandar o pix delas
- Pedido ir com nome do cliente


- Programa pra cadastrar o catálogo e puxar sempre a API.


# PEGAR IP DO WSL
- ip addr show eth0 | grep "inet " | awk '{print $2}' | cut -d/ -f1


ITEM
{
    "nome": "Foto",
    "tamanho": "10x15",
    "descricao": "Uma simples foto",
    "itens_gastos": "Foto, papel
    "precoUnid": 10.0,
    "categoria": "Polaroids e Fotos"
    "pedido_min": 1
    ""
  },




  [
  {
    "key": "nome",
    "type": "text",
    "label": "Nome do item",
    "required": true
  },
  {
    "key": "descricao",
    "type": "textarea",
    "label": "Descrição",
    "required": false
  },
  {
    "key": "preco",
    "type": "currency",
    "label": "Preço",
    "required": true
  },
  {
    "key": "preco_original",
    "type": "currency",
    "label": "Preço Original",
    "required": false
  },
  {
    "key": "categoria",
    "type": "text",
    "label": "Categoria",
    "required": false
  },
  {
    "key": "requisicao_fotos",
    "type": "boolean",
    "label": "Precisa de foto?",
    "required": false
  },
  {
    "key": "quantidade_minima",
    "type": "number",
    "label": "Quantidade minima",
    "required": false
  },
  {
    "key": "preco_adicional",
    "type": "number",
    "label": "Preço adicional?",
    "required": false
  },
  {
    "key": "aceita_legenda",
    "type": "boolean",
    "label": "Aceita legenda?",
    "required": false
  },
  {
    "key": "preco_legenda",
    "type": "number",
    "label": "Preço da legenda",
    "required": false
  },
  {
    "key": "tamanho",
    "type": "text",
    "label": "Tamanho",
    "required": false
  },
  {
    "key": "observacoes",
    "type": "textarea",
    "label": "Observações",
    "required": false
  },
  {
    "key": "itens_gastos",
    "type": "textarea",
    "label": "Itens gastos",
    "options": [
      "itens_gastos"
    ],
    "required": false
  },
  {
    "key": "ativo",
    "type": "boolean",
    "label": "Ativo",
    "required": true
  },
  {
    "key": "prazo_producao",
    "type": "number",
    "label": "Prazo de produção",
    "required": false
  },
  {
    "key": "destaque",
    "type": "boolean",
    "label": "Destaque",
    "required": false
  }
]