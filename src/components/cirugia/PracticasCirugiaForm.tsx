"use client";

// Formulario para agregar prácticas del nomenclador
import React, { useState, useContext } from 'react';
import { z } from 'zod';
import { PracticaCirugiaSchema } from '@/modules/cirugia/schemas';
import { CirugiaContext } from './CirugiaForm';

interface PracticaCirugia {
    codigo: string;
    descripcion: string;
    cantidad: number;
}

const PracticasCirugiaForm = () => {
    const { practicas, setPracticas } = useContext(CirugiaContext);
    const [nueva, setNueva] = useState<PracticaCirugia>({ codigo: '', descripcion: '', cantidad: 1 });
    const [error, setError] = useState<string | null>(null);

    const handleAdd = () => {
        try {
            PracticaCirugiaSchema.parse(nueva);
            setPracticas([...practicas, nueva]);
            setNueva({ codigo: '', descripcion: '', cantidad: 1 });
            setError(null);
        } catch (e: any) {
            setError(e.errors?.[0]?.message || 'Error en los datos');
        }
    };

    return (
        <div className="his-card p-4 mb-4">
            <h3 className="text-base font-semibold mb-2">Prácticas de cirugía</h3>
            <div className="flex gap-2 mb-2">
                <input
                    type="text"
                    placeholder="Código"
                    value={nueva.codigo}
                    onChange={e => setNueva({ ...nueva, codigo: e.target.value })}
                    className="border rounded px-2 py-1 text-sm"
                />
                <input
                    type="text"
                    placeholder="Descripción"
                    value={nueva.descripcion}
                    onChange={e => setNueva({ ...nueva, descripcion: e.target.value })}
                    className="border rounded px-2 py-1 text-sm"
                />
                <input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Cantidad"
                    value={nueva.cantidad}
                    onChange={e => setNueva({ ...nueva, cantidad: Number(e.target.value) })}
                    className="border rounded px-2 py-1 text-sm w-20"
                />
                <button type="button" onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1 rounded">
                    Agregar
                </button>
            </div>
            {error && <div className="text-red-600 text-xs mb-2">{error}</div>}
            <ul className="list-disc pl-5">
                {practicas.map((p: PracticaCirugia, idx: number) => (
                    <li key={idx} className="text-sm">
                        {p.codigo} - {p.descripcion} (x{p.cantidad})
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default PracticasCirugiaForm;
