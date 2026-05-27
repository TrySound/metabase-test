const getData = async (searchTerm) => {
    const response = await fetch(`/search?term=${searchTerm}`);
    if (!response.ok) {
        throw new Error(`${response.statusText}`);
    } else {
        return await response.json();
    }
}

export default function App() {
    return (
        <p>Hello world</p>
    );
}