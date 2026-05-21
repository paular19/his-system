"use client";

// Formulario para cargar número de autorización de la obra social
import React, { useState, useContext } from 'react';
import { CirugiaContext } from './CirugiaForm';

const AutorizacionCirugiaForm = () => {
    const { numeroAutorizacion, setNumeroAutorizacion } = useContext(CirugiaContext);
    const [guardado, setGuardado] = useState(false);

    const handleGuardar = () => {
        if (numeroAutorizacion.trim()) {
            setGuardado(true);
            // Aquí se podría llamar a una API para guardar el número
        }
    };

    return (
        <div className="his-card p-4 mb-4">
            <h3 className="text-base font-semibold mb-2">Número de autorización</h3>
            <div className="flex gap-2 items-center">
                <input
                    type="text"
                    placeholder="N° de autorización de obra social"
                    value={numeroAutorizacion}
                    onChange={e => setNumeroAutorizacion(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                />
                <button type="button" onClick={handleGuardar} className="bg-blue-600 text-white px-3 py-1 rounded">
                    Guardar
                </button>
            </div>
            {guardado && <div className="text-green-600 text-xs mt-2">Número guardado</div>}
        </div>
    );
};

export default AutorizacionCirugiaForm;
