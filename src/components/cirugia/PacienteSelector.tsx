"use client";

// Selector de paciente para cirugía programada
import React, { useState, useContext } from 'react';
import { CirugiaContext } from './CirugiaForm';

const PacienteSelector = () => {
    const { paciente, setPaciente } = useContext(CirugiaContext);
    const [buscar, setBuscar] = useState('');
    const [resultados, setResultados] = useState<any[]>([]);

    const handleBuscar = async (valor: string) => {
        setBuscar(valor);
        if (valor.length < 3) {
            setResultados([]);
            return;
        }

        // Aquí iría la búsqueda real de pacientes
        // Por ahora, solo un placeholder
    };

    return (
        <div className="his-card p-4 mb-4">
            <h3 className="text-base font-semibold mb-2">Paciente</h3>
            {paciente ? (
                <div className="mb-2">
                    <div className="text-sm font-medium">{paciente.apellido}, {paciente.nombre}</div>
                    <div className="text-xs text-gray-500">DNI: {paciente.numeroDocumento}</div>
                    <button onClick={() => setPaciente(null)} className="text-blue-600 text-xs mt-1">Cambiar paciente</button>
                </div>
            ) : (
                <div>
                    <input
                        type="text"
                        placeholder="Buscar paciente por DNI, nombre o apellido..."
                        value={buscar}
                        onChange={(e) => handleBuscar(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded mb-2"
                    />
                    {resultados.length > 0 && (
                        <div className="border border-gray-300 rounded max-h-48 overflow-y-auto">
                            {resultados.map((p) => (
                                <div
                                    key={p.id}
                                    onClick={() => {
                                        setPaciente(p);
                                        setBuscar('');
                                        setResultados([]);
                                    }}
                                    className="p-2 border-b hover:bg-gray-100 cursor-pointer"
                                >
                                    <div className="text-sm font-medium">{p.nombreCompleto}</div>
                                    <div className="text-xs text-gray-500">DNI: {p.numeroDocumento}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PacienteSelector;
