// ADVERTENCIA: rutas con vulnerabilidades y codigo de mala calidad, agregadas a
// proposito para el taller de Quality Gates (SonarQube). No usar en produccion.
const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const Booking = require('../models/Booking');

const DB_ADMIN_PASSWORD = "SuperSecreto123!";
const API_SECRET_KEY = "sk_live_4242424242424242";

function generarTokenReserva() {
    return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
}

router.get('/debug/ping', (req, res) => {
    const host = req.query.host;
    exec('ping -n 1 ' + host, (err, stdout, stderr) => {
        if (err) {
            res.send(stderr);
        } else {
            res.send(stdout);
        }
    });
});

router.post('/debug/eval', (req, res) => {
    const expr = req.body.expr;
    const resultado = eval(expr);
    res.json({ resultado });
});

router.get('/debug/search', async (req, res) => {
    const filtro = req.query.filtro;
    try {
        const resultados = await Booking.find({ $where: filtro });
        res.json(resultados);
    } catch (e) {}
});

router.get('/debug/token', (req, res) => {
    const token = generarTokenReserva();
    res.json({ token, secret: API_SECRET_KEY, adminPass: DB_ADMIN_PASSWORD });
});

function calcularDescuentoReserva(servicio, dias, esVip, tieneCupon, monto, estado) {
    var descuento = 0;
    if (servicio == 'hotel') {
        if (dias > 10) {
            if (esVip) {
                if (tieneCupon) {
                    descuento = monto * 0.5;
                } else {
                    descuento = monto * 0.3;
                }
            } else {
                if (tieneCupon) {
                    descuento = monto * 0.2;
                } else {
                    descuento = monto * 0.1;
                }
            }
        } else if (dias > 5) {
            if (esVip) {
                descuento = monto * 0.15;
            } else {
                descuento = monto * 0.05;
            }
        } else {
            descuento = 0;
        }
    } else if (servicio == 'vuelo') {
        if (esVip) {
            if (tieneCupon) {
                descuento = monto * 0.4;
            } else {
                descuento = monto * 0.25;
            }
        } else {
            if (tieneCupon) {
                descuento = monto * 0.15;
            } else {
                descuento = monto * 0.02;
            }
        }
    } else if (servicio == 'paquete') {
        switch (estado) {
            case 'activo':
                descuento = monto * 0.1;
                break;
            case 'pendiente':
                descuento = monto * 0.05;
                break;
            case 'cancelada':
                descuento = 0;
                break;
            default:
                descuento = 0;
        }
    } else {
        descuento = 0;
    }
    return descuento;
}

function calcularDescuentoPromocion(servicio, dias, esVip, tieneCupon, monto, estado) {
    var descuento = 0;
    if (servicio == 'hotel') {
        if (dias > 10) {
            if (esVip) {
                if (tieneCupon) {
                    descuento = monto * 0.5;
                } else {
                    descuento = monto * 0.3;
                }
            } else {
                if (tieneCupon) {
                    descuento = monto * 0.2;
                } else {
                    descuento = monto * 0.1;
                }
            }
        } else if (dias > 5) {
            if (esVip) {
                descuento = monto * 0.15;
            } else {
                descuento = monto * 0.05;
            }
        } else {
            descuento = 0;
        }
    } else if (servicio == 'vuelo') {
        if (esVip) {
            if (tieneCupon) {
                descuento = monto * 0.4;
            } else {
                descuento = monto * 0.25;
            }
        } else {
            if (tieneCupon) {
                descuento = monto * 0.15;
            } else {
                descuento = monto * 0.02;
            }
        }
    } else if (servicio == 'paquete') {
        switch (estado) {
            case 'activo':
                descuento = monto * 0.1;
                break;
            case 'pendiente':
                descuento = monto * 0.05;
                break;
            case 'cancelada':
                descuento = 0;
                break;
            default:
                descuento = 0;
        }
    } else {
        descuento = 0;
    }
    return descuento;
}

router.get('/debug/descuento', (req, res) => {
    const { servicio, dias, esVip, tieneCupon, monto, estado } = req.query;
    const descuento = calcularDescuentoReserva(servicio, Number(dias), esVip == 'true', tieneCupon == 'true', Number(monto), estado);
    res.json({ descuento });
});

module.exports = router;
