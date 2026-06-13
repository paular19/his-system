"use client";

// Formulario para agregar prácticas del nomenclador
import React, { useState, useContext } from 'react';
import { z } from 'zod';
import { PracticaCirugiaSchema } from '@/modules/cirugia/schemas';
import { CirugiaContext } from './CirugiaForm';

interface PracticaCirugia {
    codigo: string;
    descripcion: string;
}

const PracticasCirugiaForm = () => {
    const { practicas, setPracticas } = useContext(CirugiaContext);
    const [nueva, setNueva] = useState<PracticaCirugia>({ codigo: '', descripcion: '' });
    const [error, setError] = useState<string | null>(null);

    const handleAdd = () => {
        try {
            const practica = { ...nueva, cantidad: 1 };
            PracticaCirugiaSchema.parse(practica);
            setPracticas([...practicas, practica]);
            setNueva({ codigo: '', descripcion: '' });
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
                <button type="button" onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1 rounded">
                    Agregar
                </button>
            </div>
            {error && <div className="text-red-600 text-xs mb-2">{error}</div>}
            <ul className="list-disc pl-5">
                {practicas.map((p: PracticaCirugia, idx: number) => (
                    <li key={idx} className="text-sm">
                        {p.codigo} - {p.descripcion}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default PracticasCirugiaForm;
