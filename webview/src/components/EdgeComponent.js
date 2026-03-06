"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EdgeComponent = void 0;
const react_1 = __importDefault(require("react"));
const EdgeComponent = ({ edge, path, selected }) => {
    return (<g>
            {/* Invisible wider path for easier selection */}
            <path d={path} stroke="transparent" strokeWidth={10} fill="none" style={{ cursor: 'pointer' }}/>
            
            {/* Visible path */}
            <path d={path} stroke={selected ? 'var(--vscode-focusBorder)' : 'var(--vscode-foreground)'} strokeWidth={selected ? 3 : 2} fill="none" markerEnd="url(#arrowhead)" opacity={0.8}/>
        </g>);
};
exports.EdgeComponent = EdgeComponent;
//# sourceMappingURL=EdgeComponent.js.map