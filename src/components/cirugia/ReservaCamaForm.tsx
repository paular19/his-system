"use client";

// Formulario para reservar cama en internación
import React, { useState, useContext } from 'react';
import { CirugiaContext } from './CirugiaForm';

const camasMock = [
    { id: 1, identificador: '101', sector: 'Ala Norte' },
    { id: 2, identificador: '102', sector: 'Ala Sur' },
];

const ReservaCamaForm = () => {
    const { cama, setCama, fechaCirugia, setFechaCirugia } = useContext(CirugiaContext);
    const [guardado, setGuardado] = useState(false);

    const handleGuardar = () => {
        if (cama && fechaCirugia) {
            setGuardado(true);
            // Aquí se podría llamar a una API para reservar la cama
        }
    };

    return (
        <div className="his-card p-4 mb-4">
            <h3 className="text-base font-semibold mb-2">Reserva de cama</h3>
            <div className="flex gap-2 mb-2">
                <select value={cama?.id || ''} onChange={e => setCama(camasMock.find(c => c.id === Number(e.target.value)))} className="border rounded px-2 py-1 text-sm">
                    <option value="">Seleccionar cama</option>
                    {camasMock.map(cama => (
                        <option key={cama.id} value={cama.id}>{cama.identificador} - {cama.sector}</option>
                    ))}
                </select>
                <input
                    type="date"
                    value={fechaCirugia}
                    onChange={e => setFechaCirugia(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                />
                <button type="button" onClick={handleGuardar} className="bg-blue-600 text-white px-3 py-1 rounded">
                    Reservar
                </button>
            </div>
            {guardado && <div className="text-green-600 text-xs mt-2">Cama reservada</div>}
        </div>
    );
};

export default ReservaCamaForm;
