<script lang="ts">
	// Se importa el componente primitivo de Progress
	import { Progress as ProgressPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	
	// Se tipan las propiedades del Progress primitivo
	type $$Props = ProgressPrimitive.Props;
	
	let className: $$Props["class"] = undefined;
	export let max: $$Props["max"] = 100;
	export let value: $$Props["value"];
	// Nuevo parámetro color para definir el color de la barra de progreso
	export let color: string = "";
	export { className as class };
	
	// Calcula el porcentaje completado
	$: percentage = (value ?? 0) / (max ?? 1) * 100;
	
	// Se arma la cadena de estilos para la barra:
	// Se utiliza 'color' si se proporciona; sino se define un valor por defecto (en este ejemplo "#3b82f6" equivale a la clase "bg-primary")
	$: innerStyle = `background-color: ${color ? color : "#3b82f6"}; transform: translateX(-${100 - percentage}%);`;
</script>

<ProgressPrimitive.Root
	class={cn("bg-secondary relative h-4 w-full overflow-hidden rounded-full", className)}
	{...$$restProps}
>
	<div
		class="h-full w-full flex-1 transition-all"
		style={innerStyle}
	></div>
</ProgressPrimitive.Root>