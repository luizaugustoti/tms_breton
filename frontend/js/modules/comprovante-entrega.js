// Lógica da Tela do Entregador (Canvas Touch + Rating + Envio)

document.addEventListener('DOMContentLoaded', () => {
    initSignatureCanvas();
    initStarRating();
    initFormSubmit();
});

let isDrawing = false;
let canvas, ctx;

function initSignatureCanvas() {
    canvas = document.getElementById('signatureCanvas');
    if (!canvas) return;

    ctx = canvas.getContext('2d');

    // Ajusta resolução interna do Canvas de acordo com o container
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    const placeholder = document.querySelector('.canvas-placeholder');

    function startDrawing(e) {
        isDrawing = true;
        if (placeholder) placeholder.style.display = 'none';
        ctx.beginPath();
        const pos = getPos(e);
        ctx.moveTo(pos.x, pos.y);
    }

    function draw(e) {
        if (!isDrawing) return;
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }

    function stopDrawing() {
        isDrawing = false;
    }

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    // Eventos Mouse
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    // Eventos Touch (Mobile)
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e); });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); });
    canvas.addEventListener('touchend', stopDrawing);

    // Botão Limpar
    const btnClear = document.getElementById('btnClearSignature');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (placeholder) placeholder.style.display = 'block';
        });
    }
}

function initStarRating() {
    const stars = document.querySelectorAll('.star');
    const inputRating = document.getElementById('inputRating');

    stars.forEach(star => {
        star.addEventListener('click', () => {
            const val = parseInt(star.getAttribute('data-value'));
            inputRating.value = val;

            stars.forEach(s => {
                const sVal = parseInt(s.getAttribute('data-value'));
                if (sVal <= val) {
                    s.classList.add('active');
                } else {
                    s.classList.remove('active');
                }
            });
        });
    });
}

function initFormSubmit() {
    const form = document.getElementById('formComprovante');
    const modal = document.getElementById('modalSucesso');

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            // Pega a imagem da assinatura em Base64 para envio futuro ao Backend
            const signatureBase64 = canvas ? canvas.toDataURL() : '';

            const payload = {
                pedido: 'PED-8801',
                recebedor: document.getElementById('nomeRecebedor').value,
                documento: document.getElementById('docRecebedor').value,
                notaSatisfacao: document.getElementById('inputRating').value,
                observacao: document.getElementById('txtObservacao').value,
                assinatura: signatureBase64,
                dataHora: new Date().toISOString()
            };

            console.log(' payload enviado pelo entregador:', payload);

            // Abre o Modal de Sucesso
            if (modal) {
                modal.classList.remove('hidden');
            }
        });
    }
}