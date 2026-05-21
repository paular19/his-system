"use client";

// Formulario principal para la configuración de cirugía programada
import React, { createContext, useState } from 'react';
import { crearCirugiaProgramadaAction } from '@/modules/cirugia/actions';
import PacienteSelector from './PacienteSelector';
import PracticasCirugiaForm from './PracticasCirugiaForm';
import ReservaCamaForm from './ReservaCamaForm';

// Contexto global para el flujo de cirugía
export const CirugiaContext = createContext<any>(null);

const CirugiaForm = () => {
    const [paciente, setPaciente] = useState<any>(null);
    const [practicas, setPracticas] = useState<any[]>([]);
    const [cama, setCama] = useState<any>(null);
    const [fechaCirugia, setFechaCirugia] = useState('');
    const [finalizado, setFinalizado] = useState(false);

    // Guardar todo el flujo y pasar a internación
    const handleFinalizar = async () => {
        if (!(paciente && practicas.length && cama && fechaCirugia)) return;
        await crearCirugiaProgramadaAction({
            pacienteId: paciente.id,
            practicas,
            fechaCirugia,
            camaId: cama.id,
        });
        setFinalizado(true);
        // Aquí se podría redirigir automáticamente a internación
        // window.location.href = `/dashboard/internacion/${id}`
    };

    return (
        <CirugiaContext.Provider value={{
            paciente, setPaciente,
            practicas, setPracticas,
            cama, setCama,
            fechaCirugia, setFechaCirugia
        }}>
            <div className="space-y-6">
                <h2 className="text-xl font-bold mb-4">Configuración de Cirugía Programada</h2>
                <PacienteSelector />
                <PracticasCirugiaForm />
                <ReservaCamaForm />
                <div className="flex justify-end">
                    <button
                        className="bg-green-600 text-white px-6 py-2 rounded-lg mt-4"
                        onClick={handleFinalizar}
                        disabled={!(paciente && practicas.length && cama && fechaCirugia)}
                    >
                        Finalizar y pasar a internación
                    </button>
                </div>
                {finalizado && (
                    <div className="text-green-700 font-semibold mt-4">Cirugía programada finalizada. Redirigiendo a internación...</div>
                )}
            </div>
        </CirugiaContext.Provider>
    );
};

export default CirugiaForm;
